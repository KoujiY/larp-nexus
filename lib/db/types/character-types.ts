/**
 * CharacterDocument 衍生的角色相關類型正規定義
 *
 * SkillType / ItemType 在多個檔案中有相同的類型別名定義，
 * 現統一集中於此。其他檔案請勿直接定義，改從此檔案 import。
 *
 * 注意：此檔案刻意與 mongo-helpers.ts 分離，無法合併。
 * 原因：mongo-helpers.ts 被 character-document-base.ts 引用，
 * 而 character-document-base.ts 被 Character.ts（Mongoose 模型）引用。
 * 若將此檔案合併入 mongo-helpers.ts，會形成循環依賴：
 *   Character.ts → character-document-base.ts → mongo-helpers.ts → Character.ts
 */

import type { CharacterDocument } from '@/lib/db/models/Character';

/** 角色持有的技能單一項目類型 */
export type SkillType = NonNullable<CharacterDocument['skills']>[number];

/** 角色持有的道具單一項目類型 */
export type ItemType = NonNullable<CharacterDocument['items']>[number];
