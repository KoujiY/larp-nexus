# LARP GM/玩家輔助系統 — PRD v1.0

## 1. 產品目的（Product Purpose）
本系統旨在提供 LARP（Live Action Role Playing）活動的 GM 與玩家使用的劇本管理、角色資訊發放、即時互動通知平台。

- GM：建立劇本、角色卡、公開資訊、推送事件。
- 玩家：無需登入即可查看角色卡、接收更新。
- 追求輕量、快速可用的 MVP。

---

## 2. 使用者角色（User Roles）

### 2.1 GM（主持人）
- 建立與管理劇本
- 建立角色卡（含四碼鎖）
- 編輯公開資訊（世界觀、章節、前導故事）
- 推送事件（WebSocket）
- 切換管理多個劇本

### 2.2 玩家
- 無需登入
- 透過專屬 URL / QR code 查看角色卡
- PIN 解鎖機制（若 GM 有設定）
- 即時接收角色卡更新

---

## 3. 功能規格（Features）

### 3.1 GM 端

#### 3.1.1 GM 帳號系統
- Email 登入（Magic Link / OTP）
- 可修改顯示名稱

#### 3.1.2 劇本列表頁（可切換劇本）
- 列出所有劇本
- 顯示標題、狀態、角色數
- 可進入劇本管理 Dashboard

#### 3.1.3 建立劇本
- 標題、封面（選填）
- 劇本描述（公開）
- 章節 / 前導故事（公開）
- 狀態：草稿 / 進行中 / 已完成

#### 3.1.4 建立角色卡
- 名稱
- 頭像圖片上傳（壓縮/限制大小）
- 公開資訊
- 秘密資訊（上鎖）
- 任務 / 道具
- 四碼 PIN
- 自動生成 URL + QR code

#### 3.1.5 推送事件 / 即時更新
- 廣播事件（全體玩家）
- 角色私訊（特定角色卡）
- 更新角色資訊（玩家端即時同步）

---

### 3.2 玩家端

#### 3.2.1 玩家首頁
- 顯示頭像、名稱
- 若角色有 PIN → 顯示解鎖畫面

#### 3.2.2 角色卡
- 公開資訊
- 秘密區（根據 GM 解鎖狀態）
- 任務與物品
- 即時事件顯示（toast / 區塊更新）

#### 3.2.3 無需登入
- 完全依照 URL 進入

---

## 4. Wireframes（圖片已生成）

### GM 端首頁（Dashboard）
- 位於：`A_wireframe_mockup_of_a_GM_(Game_Master)_Dashboard.png`

### 玩家端首頁
- 位於：`A_wireframe_digital_mockup_of_a_mobile_player_inte.png`

---

## 5. 技術架構（Tech Stack）

### 5.1 Next.js + TypeScript
- 前後端合一
- Server Actions、API Routes 皆可使用

### 5.2 前端技術
- shadcn/ui（GM 端大量表單）
- Jotai（輕量狀態管理）
- Tailwind CSS

### 5.3 資料庫：MongoDB Atlas
- 免費方案適合作為 MVP

### 5.4 圖片上傳
- 使用 Vercel Blob Storage（免費方案）
- 自動壓縮與限制尺寸

### 5.5 即時事件
- Pusher 或 Vercel Realtime
- 採 ephemeral short session WebSocket

### 5.6 API 與 Server Actions
- 劇本 CRUD → Server Actions
- 角色 CRUD → API routes
- 即時事件推送 → API routes + WebSocket SDK

### 5.7 部署
- Next.js → Vercel
- MongoDB → Atlas
- 圖片 → Vercel Blob

---

## 6. DB Schema（概要）

### games
```
{
  _id,
  gmId,
  title,
  description,
  coverImage,
  publicInfo: {
    intro,
    chapters: []
  },
  status,
  createdAt,
  updatedAt
}
```

### characters
```
{
  _id,
  gameId,
  name,
  avatar,
  hasPinLock,
  pin (hashed),
  publicInfo,
  secretInfo,
  tasks: [],
  items: [],
  wsChannelId,
  createdAt,
  updatedAt
}
```

### gm_users
```
{
  _id,
  email,
  displayName,
  createdAt
}
```

---

## 7. WebSocket 事件（概要）
- `role.updated`
- `game.broadcast`
- `role.secretUnlocked`
- `role.message`
- `role.inventoryUpdated`

完整格式將在後續技術文件定義。

---

## 8. MVP 版本功能

### GM 必要功能
- Email 登入
- 建立劇本
- 建立角色卡
- 圖片上傳
- 事件推送

### 玩家必要功能
- URL 開啟角色卡
- PIN 解鎖
- 即時事件接收

---

## 9. 非功能需求

### 效能
- 玩家端初次讀取 < 1 秒

### 安全
- PIN 使用 hash 儲存
- 圖片大小限制

### 使用性
- 玩家端手機優先
- GM 端電腦優先

---

## 10. 下一步工作
- 建立 Next.js 專案結構
- 繪製更多 wireframes
- 制定 WebSocket 事件格式
- 撰寫 API spec

