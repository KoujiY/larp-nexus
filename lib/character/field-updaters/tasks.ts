/**
 * 角色任務（Tasks）欄位更新器
 */

import type { MongoTask } from '@/lib/db/types/mongo-helpers';
import type { AutoRevealConditionType } from '@/types/character';

/**
 * 更新角色 Tasks
 *
 * @param tasks Tasks 陣列
 * @param currentTasks 當前 Tasks 陣列（用於保留時間戳）
 * @returns 更新後的 Tasks 資料
 */
export function updateCharacterTasks(
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    isHidden: boolean;
    isRevealed: boolean;
    revealedAt?: Date;
    status: 'pending' | 'in-progress' | 'completed' | 'failed';
    completedAt?: Date;
    gmNotes?: string;
    revealCondition?: string;
    // Phase 7.7: 自動揭露條件
    autoRevealCondition?: {
      type: string;
      itemIds?: string[];
      secretIds?: string[];
      matchLogic?: string;
    };
    createdAt: Date;
  }>,
  currentTasks: MongoTask[] = []
): MongoTask[] {
  return tasks.map((newTask): MongoTask => {
    const oldTask = currentTasks.find((t) => t.id === newTask.id);

    // 計算 autoRevealCondition
    const autoRevealCondition: MongoTask['autoRevealCondition'] =
      newTask.autoRevealCondition && newTask.autoRevealCondition.type !== 'none'
        ? {
            ...newTask.autoRevealCondition,
            type: newTask.autoRevealCondition.type as AutoRevealConditionType,
            matchLogic: newTask.autoRevealCondition.matchLogic as 'and' | 'or' | undefined,
          }
        : (!newTask.autoRevealCondition && oldTask?.autoRevealCondition)
          ? oldTask.autoRevealCondition
          : undefined;
    // 若 type 為 'none' 或 undefined，不設定 autoRevealCondition（清除）

    // 計算 revealedAt（隱藏目標從未揭露變為已揭露時設定）
    const revealedAt: Date | undefined =
      (newTask.isHidden && newTask.isRevealed && (!oldTask || !oldTask.isRevealed))
        ? new Date()
        : oldTask?.revealedAt;

    // 計算 completedAt（狀態變為已完成/失敗時設定）
    const completedAt: Date | undefined =
      ((newTask.status === 'completed' || newTask.status === 'failed') &&
       (!oldTask || (oldTask.status !== 'completed' && oldTask.status !== 'failed')))
        ? new Date()
        : oldTask?.completedAt;

    const cleanTask: MongoTask = {
      id: newTask.id,
      title: newTask.title,
      description: newTask.description,
      isHidden: newTask.isHidden,
      isRevealed: newTask.isRevealed,
      revealedAt,
      status: newTask.status,
      completedAt,
      gmNotes: newTask.gmNotes || '',
      revealCondition: newTask.revealCondition || '',
      createdAt: newTask.createdAt || new Date(),
      ...(autoRevealCondition !== undefined ? { autoRevealCondition } : {}),
    };

    return cleanTask;
  });
}
