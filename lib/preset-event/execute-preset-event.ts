import { GameRuntime, CharacterRuntime } from '@/lib/db/models';
import { emitSecretRevealed, emitTaskRevealed, emitRoleUpdated } from '@/lib/websocket/events';
import { getPusherServer, isPusherEnabled } from '@/lib/websocket/pusher-server';
import { writeLog } from '@/lib/logs/write-log';
import { computeStatChange } from '@/lib/effects/shared-effect-executor';
import { createTemporaryEffectRecord } from '@/lib/effects/create-temporary-effect';
import dbConnect from '@/lib/db/mongodb';
import type { PresetEventAction, ActionTarget } from '@/types/game';

// ─── Types ───────────────────────────────────────────

export interface ActionResult {
  actionId: string;
  type: string;
  status: 'success' | 'skipped' | 'failed';
  reason?: string;
}

export interface ExecutionResult {
  success: boolean;
  eventName: string;
  results: ActionResult[];
  executedAt: Date;
}

// ─── Main ────────────────────────────────────────────

/**
 * 執行預設事件
 *
 * 1. 從 GameRuntime 找到事件
 * 2. 依序執行每個動作（best-effort，單一失敗不阻斷後續）
 * 3. 更新事件執行狀態（executedAt, executionCount）
 * 4. 回傳執行結果摘要
 */
export async function executePresetEvent(
  gameId: string,
  eventId: string,
  gmUserId: string,
): Promise<ExecutionResult> {
  await dbConnect();

  // 找到 GameRuntime
  const runtime = await GameRuntime.findOne({ refId: gameId, type: 'runtime' });
  if (!runtime) {
    throw new Error('找不到 GameRuntime');
  }

  const events = (runtime.presetEvents || []) as Array<{
    id: string;
    name: string;
    showName?: boolean;
    actions: PresetEventAction[];
    executionCount: number;
  }>;
  const event = events.find((e) => e.id === eventId);
  if (!event) {
    throw new Error('找不到此預設事件');
  }

  // 取得此遊戲所有 Runtime 角色（用於驗證目標）
  const runtimeCharacters = await CharacterRuntime.find({
    gameId,
    type: 'runtime',
  }).lean();

  // 建立 baselineId → runtimeCharacter 的對應
  const charByBaselineId = new Map(
    runtimeCharacters.map((c) => [c.refId.toString(), c]),
  );

  // 玩家端顯示名稱：showName 啟用時顯示事件名稱，否則隱藏
  const displayName = event.showName ? event.name : '';

  // 依序執行動作
  const results: ActionResult[] = [];
  for (const action of event.actions) {
    const result = await executeAction(action, gameId, gmUserId, charByBaselineId, displayName);
    results.push(result);
  }

  // 更新事件執行狀態
  const now = new Date();
  await GameRuntime.updateOne(
    { refId: gameId, type: 'runtime', 'presetEvents.id': eventId },
    {
      $set: { 'presetEvents.$.executedAt': now },
      $inc: { 'presetEvents.$.executionCount': 1 },
    },
  );

  return {
    success: true,
    eventName: event.name,
    results,
    executedAt: now,
  };
}

// ─── Action executors ────────────────────────────────

async function executeAction(
  action: PresetEventAction,
  gameId: string,
  gmUserId: string,
  charByBaselineId: Map<string, Record<string, unknown>>,
  displayName: string,
): Promise<ActionResult> {
  try {
    switch (action.type) {
      case 'broadcast':
        return await executeBroadcast(action, gameId, gmUserId, charByBaselineId);
      case 'stat_change':
        return await executeStatChange(action, gameId, gmUserId, charByBaselineId, displayName);
      case 'reveal_secret':
        return await executeRevealSecret(action, gameId, gmUserId, charByBaselineId);
      case 'reveal_task':
        return await executeRevealTask(action, gameId, gmUserId, charByBaselineId);
      default:
        return { actionId: action.id, type: action.type, status: 'skipped', reason: `不支援的動作類型` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { actionId: action.id, type: action.type, status: 'failed', reason: message };
  }
}

/** 解析目標角色 IDs（'all' 展開為所有 baseline IDs） */
function resolveTargets(
  targets: ActionTarget | undefined,
  charByBaselineId: Map<string, Record<string, unknown>>,
): string[] {
  if (targets === 'all') return Array.from(charByBaselineId.keys());
  if (Array.isArray(targets)) return targets.filter((id) => charByBaselineId.has(id));
  return [];
}

async function executeBroadcast(
  action: PresetEventAction,
  gameId: string,
  gmUserId: string,
  charByBaselineId: Map<string, Record<string, unknown>>,
): Promise<ActionResult> {
  const targets = resolveTargets(action.broadcastTargets, charByBaselineId);
  if (targets.length === 0) {
    return { actionId: action.id, type: 'broadcast', status: 'skipped', reason: '無有效目標' };
  }

  const title = action.broadcastTitle || '';
  const message = action.broadcastMessage || '';
  const isAll = action.broadcastTargets === 'all';

  if (isAll) {
    // 全體廣播：直接觸發 WebSocket（不透過 pushEvent，避免 pending event 造成重複）
    const pusherAll = getPusherServer();
    if (pusherAll && isPusherEnabled()) {
      await pusherAll.trigger(`private-game-${gameId}`, 'game.broadcast', {
        type: 'game.broadcast',
        timestamp: Date.now(),
        payload: { gameId, title, message, priority: 'normal' },
      });
    }
    await writeLog({ gameId, actorType: 'gm', actorId: gmUserId, action: 'broadcast', details: { title, message } });
  } else {
    // 指定角色：逐一發送角色訊息
    const pusher = getPusherServer();
    for (const charId of targets) {
      if (pusher && isPusherEnabled()) {
        await pusher.trigger(`private-character-${charId}`, 'role.message', {
          type: 'role.message',
          timestamp: Date.now(),
          payload: { characterId: charId, from: 'GM', title, message, style: 'info' },
        });
      }
      await writeLog({ gameId, characterId: charId, actorType: 'gm', actorId: gmUserId, action: 'character_message', details: { title, message } });
    }
  }

  return { actionId: action.id, type: 'broadcast', status: 'success' };
}

async function executeStatChange(
  action: PresetEventAction,
  gameId: string,
  gmUserId: string,
  charByBaselineId: Map<string, Record<string, unknown>>,
  displayName: string,
): Promise<ActionResult> {
  const targets = resolveTargets(action.statTargets, charByBaselineId);
  if (targets.length === 0) {
    return { actionId: action.id, type: 'stat_change', status: 'skipped', reason: '無有效目標' };
  }
  if (!action.statName) {
    return { actionId: action.id, type: 'stat_change', status: 'skipped', reason: '未指定數值名稱' };
  }

  const delta = action.statChangeValue ?? 0;
  const statChangeTarget = action.statChangeTarget ?? 'value';
  const syncValue = action.syncValue ?? false;
  const duration = action.duration ?? 0;

  let modifiedCount = 0;
  for (const baselineId of targets) {
    const runtimeChar = charByBaselineId.get(baselineId);
    if (!runtimeChar) continue;

    const runtimeId = (runtimeChar._id as { toString(): string }).toString();
    const stats = (runtimeChar.stats || []) as Array<{ name: string; value: number; maxValue?: number; id: string }>;
    const stat = stats.find((s) => s.name === action.statName);
    if (!stat) continue;

    // 使用共用 computeStatChange 計算結果
    const result = computeStatChange(stat, delta, statChangeTarget, syncValue);

    // 建立更新操作
    const updateOps: Record<string, unknown> = {};
    const statIndex = stats.findIndex((s) => s.name === action.statName);
    updateOps[`stats.${statIndex}.value`] = result.newValue;
    if (result.effectiveTarget === 'maxValue' && result.newMaxValue !== undefined) {
      updateOps[`stats.${statIndex}.maxValue`] = result.newMaxValue;
    }

    await CharacterRuntime.updateOne(
      { _id: runtimeId },
      { $set: updateOps },
    );

    // 時效性效果：建立 TemporaryEffect 記錄
    if (duration > 0) {
      await createTemporaryEffectRecord(
        baselineId,
        {
          sourceType: 'preset_event',
          sourceId: action.id,
          sourceCharacterId: gmUserId,
          sourceCharacterName: 'GM',
          sourceName: displayName || '預設事件',
        },
        {
          targetStat: action.statName!,
          deltaValue: result.deltaValue !== 0 ? result.deltaValue : undefined,
          deltaMax: result.deltaMax !== 0 ? result.deltaMax : undefined,
          statChangeTarget: result.effectiveTarget,
          syncValue,
        },
        duration,
      );
    }

    // 推送 WebSocket — 告知玩家數值變動（含 delta 供通知映射器使用）
    const updatedStats = stats.map((s, i) => {
      if (i !== statIndex) return s;
      return {
        ...s,
        value: result.newValue,
        ...(result.newMaxValue !== undefined ? { maxValue: result.newMaxValue } : {}),
      };
    });
    await emitRoleUpdated(baselineId, {
      characterId: baselineId,
      updates: {
        stats: updatedStats.map((s, i) => ({
          id: s.id,
          name: s.name,
          value: s.value,
          maxValue: s.maxValue,
          ...(i === statIndex ? { deltaValue: result.deltaValue, deltaMax: result.deltaMax } : {}),
        })),
      },
    });

    await writeLog({
      gameId,
      characterId: baselineId,
      actorType: 'gm',
      actorId: gmUserId,
      action: 'stat_change',
      details: {
        statName: action.statName,
        oldValue: stat.value,
        newValue: result.newValue,
        ...(result.effectiveTarget === 'maxValue' ? { oldMaxValue: stat.maxValue, newMaxValue: result.newMaxValue } : {}),
        reason: '預設事件',
      },
    });

    modifiedCount++;
  }

  if (modifiedCount === 0) {
    return { actionId: action.id, type: 'stat_change', status: 'skipped', reason: `沒有角色擁有「${action.statName}」數值` };
  }
  return { actionId: action.id, type: 'stat_change', status: 'success' };
}

async function executeRevealSecret(
  action: PresetEventAction,
  gameId: string,
  gmUserId: string,
  charByBaselineId: Map<string, Record<string, unknown>>,
): Promise<ActionResult> {
  const charId = action.revealCharacterId;
  if (!charId || !charByBaselineId.has(charId)) {
    return { actionId: action.id, type: 'reveal_secret', status: 'skipped', reason: '目標角色不存在' };
  }
  if (!action.revealTargetId) {
    return { actionId: action.id, type: 'reveal_secret', status: 'skipped', reason: '未指定隱藏資訊' };
  }

  const runtimeChar = charByBaselineId.get(charId)!;
  const runtimeId = (runtimeChar._id as { toString(): string }).toString();
  const secrets = ((runtimeChar.secretInfo as Record<string, unknown>)?.secrets || []) as Array<{
    id: string;
    title: string;
    isRevealed: boolean;
  }>;
  const secret = secrets.find((s) => s.id === action.revealTargetId);

  if (!secret) {
    return { actionId: action.id, type: 'reveal_secret', status: 'skipped', reason: '目標隱藏資訊不存在' };
  }
  if (secret.isRevealed) {
    return { actionId: action.id, type: 'reveal_secret', status: 'skipped', reason: '目標隱藏資訊已揭露' };
  }

  // 更新 Runtime
  await CharacterRuntime.updateOne(
    { _id: runtimeId, 'secretInfo.secrets.id': action.revealTargetId },
    {
      $set: {
        'secretInfo.secrets.$.isRevealed': true,
        'secretInfo.secrets.$.revealedAt': new Date(),
      },
    },
  );

  // 推送 WebSocket
  await emitSecretRevealed(charId, {
    characterId: charId,
    secretId: action.revealTargetId,
    secretTitle: secret.title,
    revealType: 'manual',
    triggerReason: '預設事件觸發',
  });

  await writeLog({
    gameId,
    characterId: charId,
    actorType: 'gm',
    actorId: gmUserId,
    action: 'secret_reveal',
    details: { secretTitle: secret.title },
  });

  return { actionId: action.id, type: 'reveal_secret', status: 'success' };
}

async function executeRevealTask(
  action: PresetEventAction,
  gameId: string,
  gmUserId: string,
  charByBaselineId: Map<string, Record<string, unknown>>,
): Promise<ActionResult> {
  const charId = action.revealCharacterId;
  if (!charId || !charByBaselineId.has(charId)) {
    return { actionId: action.id, type: 'reveal_task', status: 'skipped', reason: '目標角色不存在' };
  }
  if (!action.revealTargetId) {
    return { actionId: action.id, type: 'reveal_task', status: 'skipped', reason: '未指定隱藏任務' };
  }

  const runtimeChar = charByBaselineId.get(charId)!;
  const runtimeId = (runtimeChar._id as { toString(): string }).toString();
  const tasks = (runtimeChar.tasks || []) as Array<{
    id: string;
    title: string;
    isHidden: boolean;
    isRevealed: boolean;
  }>;
  const task = tasks.find((t) => t.id === action.revealTargetId);

  if (!task) {
    return { actionId: action.id, type: 'reveal_task', status: 'skipped', reason: '目標隱藏任務不存在' };
  }
  if (!task.isHidden) {
    return { actionId: action.id, type: 'reveal_task', status: 'skipped', reason: '目標任務不是隱藏任務' };
  }
  if (task.isRevealed) {
    return { actionId: action.id, type: 'reveal_task', status: 'skipped', reason: '目標隱藏任務已揭露' };
  }

  // 更新 Runtime
  await CharacterRuntime.updateOne(
    { _id: runtimeId, 'tasks.id': action.revealTargetId },
    {
      $set: {
        'tasks.$.isRevealed': true,
        'tasks.$.revealedAt': new Date(),
      },
    },
  );

  // 推送 WebSocket
  await emitTaskRevealed(charId, {
    characterId: charId,
    taskId: action.revealTargetId,
    taskTitle: task.title,
    revealType: 'manual',
    triggerReason: '預設事件觸發',
  });

  await writeLog({
    gameId,
    characterId: charId,
    actorType: 'gm',
    actorId: gmUserId,
    action: 'task_reveal',
    details: { taskTitle: task.title },
  });

  return { actionId: action.id, type: 'reveal_task', status: 'success' };
}
