'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { withAction } from '@/lib/actions/action-wrapper';
import { Game, GameRuntime } from '@/lib/db/models';
import { getCurrentGMUserId } from '@/lib/auth/session';
import { executePresetEvent, type ExecutionResult } from '@/lib/preset-event/execute-preset-event';
import type { ApiResponse } from '@/types/api';
import type { PresetEvent, PresetEventInput, PresetEventRuntime } from '@/types/game';

// ─── Validation ──────────────────────────────────────

const actionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['broadcast', 'stat_change', 'reveal_secret', 'reveal_task']),
  // broadcast
  broadcastTargets: z.union([z.literal('all'), z.array(z.string())]).optional(),
  broadcastTitle: z.string().max(100).optional(),
  broadcastMessage: z.string().max(2000).optional(),
  // stat_change
  statTargets: z.union([z.literal('all'), z.array(z.string())]).optional(),
  statName: z.string().max(50).optional(),
  statChangeTarget: z.enum(['value', 'maxValue']).optional(),
  statChangeValue: z.number().optional(),
  syncValue: z.boolean().optional(),
  duration: z.number().int().min(0).optional(),
  // reveal
  revealCharacterId: z.string().optional(),
  revealTargetId: z.string().optional(),
});

const presetEventSchema = z.object({
  name: z.string().min(1, '事件名稱不可為空').max(100, '事件名稱不可超過 100 字元'),
  description: z.string().max(500).optional(),
  showName: z.boolean().optional(),
  actions: z.array(actionSchema).min(1, '至少需要一個動作'),
});

// ─── Helpers ─────────────────────────────────────────

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 驗證 GM 是否為此 game 的擁有者
 *
 * Runtime CRUD 無法像 Baseline CRUD 那樣直接用 `{ _id: gameId, gmUserId }`
 * 過濾 Game 文件（Runtime 存在 GameRuntime 模型），因此需要先查 Baseline
 * Game 驗證 gmUserId，再對 Runtime 操作。
 */
async function assertGameOwnership(
  gameId: string,
  gmUserId: string,
): Promise<boolean> {
  const game = await Game.findOne({ _id: gameId, gmUserId }).select('_id').lean();
  return game !== null;
}

// ─── CRUD Actions ────────────────────────────────────

/**
 * 新增預設事件
 */
export async function createPresetEvent(
  gameId: string,
  data: PresetEventInput,
): Promise<ApiResponse<PresetEvent>> {
  return withAction(async () => {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
    }

    const validated = presetEventSchema.parse(data);

    const newEvent: PresetEvent = {
      id: generateId(),
      name: validated.name,
      description: validated.description || '',
      showName: validated.showName ?? false,
      actions: validated.actions,
    };

    // 使用 $push 原子操作，避免 game.save() 觸發全文件驗證
    const result = await Game.updateOne(
      { _id: gameId, gmUserId },
      { $push: { presetEvents: newEvent } },
    );
    if (result.matchedCount === 0) {
      return { success: false, error: 'NOT_FOUND', message: '找不到此劇本' };
    }

    revalidatePath(`/games/${gameId}`);
    return { success: true, data: newEvent, message: '預設事件已建立' };
  });
}

/**
 * 更新預設事件
 */
export async function updatePresetEvent(
  gameId: string,
  eventId: string,
  data: PresetEventInput,
): Promise<ApiResponse<PresetEvent>> {
  return withAction(async () => {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
    }

    const validated = presetEventSchema.parse(data);

    const updatedEvent: PresetEvent = {
      id: eventId,
      name: validated.name,
      description: validated.description || '',
      showName: validated.showName ?? false,
      actions: validated.actions,
    };

    // 使用 positional $ 原子更新，避免 game.save() 觸發全文件驗證
    const result = await Game.updateOne(
      { _id: gameId, gmUserId, 'presetEvents.id': eventId },
      { $set: { 'presetEvents.$': updatedEvent } },
    );
    if (result.matchedCount === 0) {
      return { success: false, error: 'NOT_FOUND', message: '找不到此預設事件' };
    }

    revalidatePath(`/games/${gameId}`);
    return { success: true, data: updatedEvent, message: '預設事件已更新' };
  });
}

/**
 * 刪除預設事件
 */
export async function deletePresetEvent(
  gameId: string,
  eventId: string,
): Promise<ApiResponse<{ deleted: boolean }>> {
  return withAction(async () => {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
    }

    // 使用 $pull 原子操作，避免 game.save() 觸發全文件驗證
    const result = await Game.updateOne(
      { _id: gameId, gmUserId },
      { $pull: { presetEvents: { id: eventId } } },
    );
    if (result.matchedCount === 0) {
      return { success: false, error: 'NOT_FOUND', message: '找不到此劇本' };
    }

    revalidatePath(`/games/${gameId}`);
    return { success: true, data: { deleted: true }, message: '預設事件已刪除' };
  });
}

// ─── Runtime CRUD ───────────────────────────────────

/**
 * 在 Runtime 中新增預設事件（runtimeOnly，不寫回 Baseline）
 */
export async function createRuntimePresetEvent(
  gameId: string,
  data: PresetEventInput,
): Promise<ApiResponse<PresetEventRuntime>> {
  return withAction(async () => {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
    }

    // L-1: 驗證呼叫方是此 game 的擁有者，避免跨 game Runtime 竄改
    if (!(await assertGameOwnership(gameId, gmUserId))) {
      return { success: false, error: 'NOT_FOUND', message: '找不到此劇本' };
    }

    const validated = presetEventSchema.parse(data);

    const runtime = await GameRuntime.findOne({ refId: gameId, type: 'runtime' });
    if (!runtime) {
      return { success: false, error: 'NOT_FOUND', message: '找不到 GameRuntime' };
    }

    const newEvent: PresetEventRuntime = {
      id: generateId(),
      name: validated.name,
      description: validated.description || '',
      showName: validated.showName ?? false,
      actions: validated.actions,
      executionCount: 0,
      runtimeOnly: true,
    };

    if (!runtime.presetEvents) {
      runtime.presetEvents = [];
    }
    (runtime.presetEvents as PresetEventRuntime[]).push(newEvent);
    runtime.markModified('presetEvents');
    await runtime.save();

    revalidatePath(`/games/${gameId}`);
    return { success: true, data: newEvent, message: '預設事件已建立（僅本場次）' };
  });
}

/**
 * 更新 Runtime 預設事件
 */
export async function updateRuntimePresetEvent(
  gameId: string,
  eventId: string,
  data: PresetEventInput,
): Promise<ApiResponse<PresetEventRuntime>> {
  return withAction(async () => {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
    }

    // L-1: 驗證呼叫方是此 game 的擁有者，避免跨 game Runtime 竄改
    if (!(await assertGameOwnership(gameId, gmUserId))) {
      return { success: false, error: 'NOT_FOUND', message: '找不到此劇本' };
    }

    const validated = presetEventSchema.parse(data);

    const runtime = await GameRuntime.findOne({ refId: gameId, type: 'runtime' });
    if (!runtime) {
      return { success: false, error: 'NOT_FOUND', message: '找不到 GameRuntime' };
    }

    const events = (runtime.presetEvents || []) as PresetEventRuntime[];
    const idx = events.findIndex((e) => e.id === eventId);
    if (idx === -1) {
      return { success: false, error: 'NOT_FOUND', message: '找不到此預設事件' };
    }

    const existing = events[idx];
    const updatedEvent: PresetEventRuntime = {
      id: eventId,
      name: validated.name,
      description: validated.description || '',
      showName: validated.showName ?? false,
      actions: validated.actions,
      executionCount: existing.executionCount,
      executedAt: existing.executedAt,
      runtimeOnly: existing.runtimeOnly,
    };

    events[idx] = updatedEvent;
    runtime.markModified('presetEvents');
    await runtime.save();

    revalidatePath(`/games/${gameId}`);
    return { success: true, data: updatedEvent, message: '預設事件已更新' };
  });
}

/**
 * 刪除 Runtime 預設事件
 */
export async function deleteRuntimePresetEvent(
  gameId: string,
  eventId: string,
): Promise<ApiResponse<{ deleted: boolean }>> {
  return withAction(async () => {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
    }

    // L-1: 驗證呼叫方是此 game 的擁有者，避免跨 game Runtime 竄改
    if (!(await assertGameOwnership(gameId, gmUserId))) {
      return { success: false, error: 'NOT_FOUND', message: '找不到此劇本' };
    }

    const runtime = await GameRuntime.findOne({ refId: gameId, type: 'runtime' });
    if (!runtime) {
      return { success: false, error: 'NOT_FOUND', message: '找不到 GameRuntime' };
    }

    const events = (runtime.presetEvents || []) as PresetEventRuntime[];
    const idx = events.findIndex((e) => e.id === eventId);
    if (idx === -1) {
      return { success: false, error: 'NOT_FOUND', message: '找不到此預設事件' };
    }

    events.splice(idx, 1);
    runtime.markModified('presetEvents');
    await runtime.save();

    revalidatePath(`/games/${gameId}`);
    return { success: true, data: { deleted: true }, message: '預設事件已刪除' };
  });
}

// ─── Runtime Queries ─────────────────────────────────

/**
 * 取得 Runtime 預設事件列表（含執行狀態）
 */
export async function getRuntimePresetEvents(
  gameId: string,
): Promise<ApiResponse<PresetEventRuntime[]>> {
  return withAction(async () => {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
    }

    // L-1: 驗證呼叫方是此 game 的擁有者
    if (!(await assertGameOwnership(gameId, gmUserId))) {
      return { success: false, error: 'NOT_FOUND', message: '找不到此劇本' };
    }

    const runtime = await GameRuntime.findOne({ refId: gameId, type: 'runtime' }).lean();
    if (!runtime) {
      return { success: false, error: 'NOT_FOUND', message: '找不到 GameRuntime' };
    }

    const events = (runtime.presetEvents || []) as PresetEventRuntime[];
    return { success: true, data: events };
  });
}

// ─── Runtime Execution ───────────────────────────────

/**
 * 執行預設事件（Runtime 模式）
 *
 * 依序執行事件中所有動作（best-effort），回傳結果摘要。
 */
export async function runPresetEvent(
  gameId: string,
  eventId: string,
): Promise<ApiResponse<ExecutionResult>> {
  return withAction(async () => {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
    }

    // L-1: 驗證呼叫方是此 game 的擁有者
    if (!(await assertGameOwnership(gameId, gmUserId))) {
      return { success: false, error: 'NOT_FOUND', message: '找不到此劇本' };
    }

    const result = await executePresetEvent(gameId, eventId, gmUserId);

    revalidatePath(`/games/${gameId}`);
    return { success: true, data: result, message: '事件已執行' };
  });
}
