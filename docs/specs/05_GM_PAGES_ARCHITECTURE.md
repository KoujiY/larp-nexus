# GM 端頁面與元件架構

## 版本：v1.0
## 更新日期：2025-11-29

---

## 1. 頁面架構總覽

GM 端採用 **Desktop First** 設計，最小支援解析度 1024px。

### 1.0 統一佈局結構（Phase 3 更新）

所有 GM 頁面採用統一的佈局結構：

```
┌─────────────────────────────────────────┐
│  [左側 Menu]  │  [右側內容區域]        │
│              │  ┌───────────────────┐  │
│  Navigation  │  │ Header (固定)     │  │
│              │  ├───────────────────┤  │
│              │  │ Content (可滾動)   │  │
│              │  │ (最大寬度限制)     │  │
│              │  └───────────────────┘  │
└─────────────────────────────────────────┘
```

**佈局特點：**
- **左側 Menu**：固定寬度 256px (w-64)，包含 Navigation 組件
- **右側內容區域**：flex-1，分為上下兩部分
  - **Header 區塊**：固定在上方，有底部邊框，背景為 card
  - **Content 區塊**：可滾動，內容有最大寬度限制並置中
- **最大寬度設定**：預設 `max-w-6xl` (lg)，可根據頁面需求調整
- **Tab 寬度**：Tab 列表使用 `w-auto`，內容靠左對齊，不滿版

### 1.1 路由結構

```
/auth/login                                      # 登入頁
/auth/verify                                     # Email 驗證頁
/dashboard                                       # 主控台（劇本總覽）
/games                                           # 劇本列表
/games/[gameId]                                  # 劇本詳情頁（含角色列表）
/games/[gameId]/characters/[characterId]         # 角色編輯頁（Tab 佈局）
/profile                                         # GM 個人設定
```

**實作方式說明：**
- **建立劇本**：透過 `/games` 頁面的 Dialog 建立
- **編輯劇本**：在劇本詳情頁的「劇本資訊」Tab 中直接編輯（Phase 3 更新：改為 Tab 形式）
- **建立角色**：透過 `/games/[gameId]` 頁面的 Dialog 建立
- **編輯角色**：點擊角色卡片進入獨立編輯頁面 `/games/[gameId]/characters/[characterId]`（支援 Tab 切換：基本資訊/數值/道具/技能/任務）

---

## 2. 頁面詳細設計

### 2.1 登入頁 (`/login`)

**功能**
- Email 輸入表單
- 發送 Magic Link
- 顯示發送狀態（Loading / Success）

**元件組成**
```tsx
<LoginPage>
  <Header />
  <LoginForm>
    <Input type="email" />
    <Button>發送 Magic Link</Button>
  </LoginForm>
  <Toast />
</LoginPage>
```

**狀態管理**
- `emailInput`: string
- `isLoading`: boolean
- `isSuccess`: boolean

**Server Action**
- `sendMagicLink(email)` - 發送登入連結

**UX 流程**
1. 使用者輸入 Email
2. 點擊「發送 Magic Link」
3. 顯示 Loading 狀態
4. 成功後顯示「請檢查您的信箱」訊息
5. 重新寄送冷卻時間：60 秒

---

### 2.2 驗證頁 (`/verify?token=xxx`)

**功能**
- 自動驗證 Token
- 驗證成功後跳轉至 Dashboard
- 顯示錯誤訊息（Token 無效/過期）

**元件組成**
```tsx
<VerifyPage>
  <LoadingSpinner />
  {error && <ErrorMessage />}
</VerifyPage>
```

**Server Action**
- `verifyMagicLink(token)` - 驗證 Token

**UX 流程**
1. 頁面載入時自動驗證
2. 成功：跳轉至 `/dashboard`
3. 失敗：顯示錯誤訊息 + 返回登入按鈕

---

### 2.3 主控台 (`/dashboard`)

**佈局結構（Phase 3 更新）**
```tsx
<PageLayout
  header={<DashboardHeader />}
  maxWidth="lg"
>
  <DashboardContent />
</PageLayout>
```

**功能**
- 顯示所有劇本列表
- 快速建立新劇本
- 劇本狀態篩選
- 搜尋劇本

**元件組成**
```tsx
<DashboardPage>
  <Header>
    <UserMenu />
    <Button href="/games/new">建立劇本</Button>
  </Header>
  
  <Filters>
    <SearchInput />
    <StatusFilter />  {/* 草稿 / 進行中 / 已完成 */}
  </Filters>
  
  <GameList>
    {games.map(game => (
      <GameCard key={game._id} game={game} />
    ))}
  </GameList>
</DashboardPage>
```

**GameCard 設計**
```tsx
<Card>
  <CardImage src={game.coverImage} />
  <CardContent>
    <h3>{game.title}</h3>
    <p>{game.description}</p>
    <Badge>{game.status}</Badge>
    <Stats>
      <Stat icon={Users} label="角色數" value={game.characterCount} />
      <Stat icon={Calendar} label="建立日期" value={formatDate(game.createdAt)} />
    </Stats>
  </CardContent>
  <CardActions>
    <Button href={`/games/${game._id}`}>管理</Button>
    <DropdownMenu>
      <MenuItem>編輯</MenuItem>
      <MenuItem>刪除</MenuItem>
    </DropdownMenu>
  </CardActions>
</Card>
```

**Server Action**
- `getGames()` - 取得劇本列表

---

### 2.4 建立劇本 (`/games/new`)

**功能**
- 劇本基本資訊輸入
- 封面圖片上傳
- 公開資訊編輯（前導故事、世界觀）
- 章節管理

**元件組成**
```tsx
<CreateGamePage>
  <Header />
  <GameForm>
    <FormSection title="基本資訊">
      <Input label="劇本標題" name="title" required />
      <Textarea label="劇本描述" name="description" />
      <ImageUpload label="封面圖片" name="coverImage" />
    </FormSection>
    
    <FormSection title="公開資訊">
      <Textarea label="前導故事" name="publicInfo.intro" />
      <Textarea label="世界觀" name="publicInfo.worldSetting" />
    </FormSection>
    
    <FormSection title="章節">
      <ChapterList>
        {chapters.map((chapter, index) => (
          <ChapterItem key={index}>
            <Input label="章節標題" />
            <Textarea label="章節內容" />
            <Button variant="ghost" onClick={() => removeChapter(index)}>
              刪除
            </Button>
          </ChapterItem>
        ))}
      </ChapterList>
      <Button onClick={addChapter}>+ 新增章節</Button>
    </FormSection>
    
    <FormActions>
      <Button variant="outline" href="/dashboard">取消</Button>
      <Button type="submit">建立劇本</Button>
    </FormActions>
  </GameForm>
</CreateGamePage>
```

**狀態管理**
- `formData`: CreateGameInput
- `chapters`: Array<Chapter>
- `isUploading`: boolean（圖片上傳中）

**Server Action**
- `createGame(data)` - 建立劇本

**驗證規則**
- 標題：必填，1-100 字元
- 描述：選填，0-500 字元
- 封面圖片：選填，< 5MB

---

### 2.5 劇本詳情 Dashboard (`/games/[gameId]`)

**功能**
- 劇本概覽（統計資料）
- 快速存取角色管理、事件推送
- 劇本狀態切換

**元件組成**
```tsx
<GameDashboardPage>
  <Header>
    <Breadcrumb>
      <BreadcrumbItem href="/dashboard">主控台</BreadcrumbItem>
      <BreadcrumbItem>{game.title}</BreadcrumbItem>
    </Breadcrumb>
    <StatusBadge status={game.status} />
  </Header>
  
  <StatsGrid>
    <StatCard icon={Users} label="角色數" value={characterCount} />
    <StatCard icon={Activity} label="進行中任務" value={activeTasksCount} />
    <StatCard icon={Package} label="總道具數" value={itemsCount} />
  </StatsGrid>
  
  <QuickActions>
    <ActionCard
      title="角色管理"
      icon={Users}
      href={`/games/${gameId}/characters`}
    />
    <ActionCard
      title="推送事件"
      icon={Send}
      href={`/games/${gameId}/events`}
    />
    <ActionCard
      title="劇本設定"
      icon={Settings}
      href={`/games/${gameId}/settings`}
    />
  </QuickActions>
  
  <RecentActivity>
    <h3>最近活動</h3>
    <ActivityList>
      {activities.map(activity => (
        <ActivityItem key={activity.id} {...activity} />
      ))}
    </ActivityList>
  </RecentActivity>
</GameDashboardPage>
```

---

### 2.6 劇本詳情頁 - 角色列表 (`/games/[gameId]`)

**說明**
- 角色列表直接整合在劇本詳情頁中，不設置獨立的 `/characters` 路由
- 採用卡片式佈局展示角色（響應式 Grid）
- 點擊角色卡片即可進入編輯頁面
- 建立新角色透過 Dialog 快速完成

**功能**
- Tab 切換：劇本資訊 / 角色列表（Phase 3 更新：改為 Tab 形式）
- 在「劇本資訊」Tab 中直接編輯劇本基本資訊與公開資訊
- 在「角色列表」Tab 中顯示所有角色（卡片式佈局）
- 快速建立新角色（Dialog）
- 點擊角色卡片進入編輯頁面
- 管理角色圖片、QR Code、PIN

**佈局結構（Phase 3 更新：統一佈局 + Tab 形式）**
```tsx
<PageLayout
  header={
    <div className="flex items-start justify-between">
      <div>
        <Breadcrumb>劇本列表 / {game.name}</Breadcrumb>
        <h1>{game.name}</h1>
        <Badge>{game.isActive ? '啟用中' : '已停用'}</Badge>
      </div>
      <Actions>
        <Button asChild><Link href={`/g/${game.id}`}>預覽公開頁面</Link></Button>
        <DeleteGameButton />
      </Actions>
    </div>
  }
  maxWidth="lg"
>
  <Tabs defaultValue="info">
    {/* Tab 列表：寬度自動，靠左對齊 */}
    <TabsList className="w-auto">
      <TabsTrigger value="info">📋 劇本資訊</TabsTrigger>
      <TabsTrigger value="characters">👥 角色列表</TabsTrigger>
    </TabsList>
    
    {/* 劇本資訊 Tab */}
    <TabsContent value="info">
      <GameEditForm game={game} />
    </TabsContent>
    
    {/* 角色列表 Tab */}
    <TabsContent value="characters">
      <CharactersSection>
        <SectionHeader>
          <div>
            <h2>角色列表</h2>
            <p>管理此劇本的角色卡（共 {characters.length} 個角色）</p>
          </div>
          <CreateCharacterButton gameId={game.id} />
        </SectionHeader>
        
        {characters.length === 0 ? (
          <EmptyState>
            <Icon>👥</Icon>
            <h3>尚無角色</h3>
            <p>新增角色開始設定角色卡資訊</p>
            <CreateCharacterButton gameId={game.id} />
          </EmptyState>
        ) : (
          <CharacterGrid columns={3}>
            {characters.map(character => (
              <CharacterCard
                key={character.id}
                character={character}
                gameId={game.id}
              />
            ))}
          </CharacterGrid>
        )}
      </CharactersSection>
    </TabsContent>
  </Tabs>
</PageLayout>
```

**Tab 寬度設計（Phase 3 更新）**
- Tab 列表使用 `w-auto`，不滿版
- Tab 內容區域自動寬度，靠左對齊
- 保持內容區域的最大寬度限制（由 PageLayout 控制）

**GameEditForm 元件**（Phase 3 新增）
```tsx
<GameEditForm>
  {/* 基本資訊 */}
  <Card>
    <CardHeader>
      <CardTitle>基本資訊</CardTitle>
      <CardDescription>設定劇本的名稱、描述與狀態</CardDescription>
    </CardHeader>
    <CardContent>
      <Input label="劇本名稱" name="name" />
      <Textarea label="劇本描述" name="description" />
      <Switch label="劇本狀態" name="isActive" />
    </CardContent>
  </Card>
  
  {/* 公開資訊（Phase 3） */}
  <Card>
    <CardHeader>
      <CardTitle>公開資訊</CardTitle>
      <CardDescription>
        設定劇本的世界觀、前導故事與章節（所有玩家可見）
      </CardDescription>
    </CardHeader>
    <CardContent>
      <Textarea label="世界觀" name="publicInfo.worldSetting" />
      <Textarea label="前導故事" name="publicInfo.intro" />
      <ChaptersEditor chapters={game.publicInfo?.chapters} />
    </CardContent>
  </Card>
</GameEditForm>
```

**CharacterCard 元件**（可點擊進入編輯）
```tsx
<Card className="cursor-pointer hover:shadow-lg hover:-translate-y-1">
  {/* 點擊卡片進入編輯頁面 */}
  <Link href={`/games/${gameId}/characters/${character.id}`}>
    <CardImage>
      {character.imageUrl ? (
        <Image src={character.imageUrl} alt={character.name} />
      ) : (
        <PlaceholderIcon>👤</PlaceholderIcon>
      )}
    </CardImage>
    
    <CardHeader>
      <CardTitle>{character.name}</CardTitle>
      <p className="line-clamp-2">{character.description}</p>
      {character.hasPinLock && <Badge>🔒 PIN</Badge>}
    </CardHeader>
    
    <CardContent>
      <p className="text-xs">建立於 {formatDate(character.createdAt)}</p>
    </CardContent>
  </Link>
  
  {/* 快捷操作按鈕（阻止點擊冒泡） */}
  <CardFooter onClick={(e) => e.stopPropagation()}>
    <UploadCharacterImageButton characterId={character.id} />
    <GenerateQRCodeButton characterId={character.id} />
    {character.hasPinLock && (
      <ViewPinButton 
        characterId={character.id} 
        characterName={character.name} 
      />
    )}
    <DeleteCharacterButton 
      characterId={character.id}
      characterName={character.name}
      gameId={gameId}
    />
    <HintText>點擊卡片進入編輯 →</HintText>
  </CardFooter>
</Card>
```

**CreateCharacterButton 元件**（Dialog 方式）
```tsx
<Dialog>
  <DialogTrigger asChild>
    <Button>+ 新增角色</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>建立新角色</DialogTitle>
    </DialogHeader>
    <form onSubmit={handleSubmit}>
      <Input label="角色名稱" name="name" required />
      <Textarea label="角色描述" name="description" />
      <Switch label="啟用 PIN 鎖定" checked={hasPinLock} />
      {hasPinLock && (
        <Input 
          label="PIN 碼（4-6 位數字）" 
          name="pin" 
          type="password"
          pattern="[0-9]{4,6}"
          required 
        />
      )}
      <DialogFooter>
        <Button type="button" variant="outline">取消</Button>
        <Button type="submit">建立</Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
```

**Server Action**
- `getGameById(gameId)` - 取得劇本資訊
- `getCharactersByGameId(gameId)` - 取得角色列表
- `createCharacter(gameId, data)` - 建立角色（透過 Dialog）

---

### 2.7 角色編輯頁（Tab 佈局）(`/games/[gameId]/characters/[characterId]`)

**佈局結構（Phase 3 更新：統一佈局）**
```tsx
<PageLayout
  header={
    <div className="flex items-center justify-between">
      <div>
        <Breadcrumb>劇本列表 / {game.name} / {character.name}</Breadcrumb>
        <h1>{character.name}</h1>
        {character.hasPinLock && <Badge>🔒 PIN 保護</Badge>}
      </div>
      <Button asChild><Link href={`/games/${gameId}`}>← 返回劇本</Link></Button>
    </div>
  }
  maxWidth="lg"
>
  <CharacterPreviewCard />
  
  <Tabs defaultValue="basic">
    {/* Tab 列表：寬度自動，靠左對齊 */}
    <TabsList className="w-auto">
      <TabsTrigger value="basic">📝 基本資訊</TabsTrigger>
      <TabsTrigger value="stats" disabled>📊 角色數值</TabsTrigger>
      <TabsTrigger value="items" disabled>🎒 道具管理</TabsTrigger>
      <TabsTrigger value="skills" disabled>⚡ 技能管理</TabsTrigger>
      <TabsTrigger value="tasks" disabled>✅ 任務管理</TabsTrigger>
    </TabsList>
    
    <TabsContent value="basic">
      <CharacterEditForm />
    </TabsContent>
    {/* 其他 Tab 顯示開發中狀態 */}
  </Tabs>
</PageLayout>
```

**說明**
- 獨立頁面，提供完整的角色編輯空間
- 使用 Tab 佈局組織不同模組（基本資訊/數值/道具/技能/任務）
- Phase 3 實作「基本資訊」Tab，其他 Tab 顯示「開發中」狀態
- 未來可擴展更多 Tab 而不會擁擠
- Tab 列表寬度自動，靠左對齊，不滿版

**功能**
- **Phase 3 實作**：基本資訊編輯（名稱、描述、PIN、公開資訊）
- **Phase 4 規劃**：角色數值、道具管理、技能管理、任務管理

**舊版頁面組成（已更新）**
```tsx
<CharacterEditPage>
  {/* Breadcrumb + Header */}
  <Header>
    <Breadcrumb>
      <Link href="/games">劇本列表</Link>
      <Link href={`/games/${gameId}`}>{game.name}</Link>
      <span>{character.name}</span>
    </Breadcrumb>
    <Actions>
      <Link href={`/games/${gameId}`}>
        <Button variant="outline">← 返回劇本</Button>
      </Link>
    </Actions>
  </Header>
  
  <PageTitle>
    <h1>{character.name}</h1>
    {character.hasPinLock && <Badge>🔒 PIN 保護</Badge>}
    <p>編輯角色資訊、管理道具與技能</p>
  </PageTitle>
  
  {/* Character Preview Card */}
  <CharacterPreviewCard>
    <CharacterImage src={character.imageUrl} />
    <CharacterInfo>
      <h3>{character.name}</h3>
      <p>{character.description}</p>
    </CharacterInfo>
    <QuickActions>
      <UploadCharacterImageButton />
      <GenerateQRCodeButton />
      <ViewPinButton />
      <DeleteCharacterButton />
    </QuickActions>
  </CharacterPreviewCard>
  
  {/* Tab Navigation */}
  <Tabs defaultValue="basic">
    <TabsList>
      <TabsTrigger value="basic">📝 基本資訊</TabsTrigger>
      <TabsTrigger value="stats" disabled>📊 角色數值</TabsTrigger>
      <TabsTrigger value="items" disabled>🎒 道具管理</TabsTrigger>
      <TabsTrigger value="skills" disabled>⚡ 技能管理</TabsTrigger>
      <TabsTrigger value="tasks" disabled>✅ 任務管理</TabsTrigger>
    </TabsList>
    
    {/* Tab Content: 基本資訊（Phase 3 實作） */}
    <TabsContent value="basic">
      <CharacterEditForm character={character} gameId={gameId} />
    </TabsContent>
    
    {/* Tab Content: 其他模組（Phase 4 開發中） */}
    <TabsContent value="stats">
      <ComingSoonCard 
        icon="📊" 
        title="角色數值" 
        description="設定角色的屬性、戰鬥數值等（Phase 4 開發中）" 
      />
    </TabsContent>
    
    <TabsContent value="items">
      <ComingSoonCard 
        icon="🎒" 
        title="道具管理" 
        description="管理角色持有的道具卡（Phase 4 開發中）" 
      />
    </TabsContent>
    
    <TabsContent value="skills">
      <ComingSoonCard 
        icon="⚡" 
        title="技能管理" 
        description="管理角色的技能與能力（Phase 4 開發中）" 
      />
    </TabsContent>
    
    <TabsContent value="tasks">
      <ComingSoonCard 
        icon="✅" 
        title="任務管理" 
        description="管理角色的任務進度（Phase 4 開發中）" 
      />
    </TabsContent>
  </Tabs>
</PageLayout>
```

**CharacterEditForm 元件**（基本資訊 Tab）
```tsx
<form onSubmit={handleSubmit}>
  <Card>
    <CardHeader>
      <CardTitle>基本資訊</CardTitle>
      <CardDescription>設定角色的名稱、描述與 PIN 鎖定選項</CardDescription>
    </CardHeader>
    <CardContent>
      <Input 
        label="角色名稱" 
        name="name" 
        value={formData.name}
        onChange={handleChange}
        required 
      />
      
      <Textarea 
        label="角色描述" 
        name="description"
        value={formData.description}
        onChange={handleChange}
        rows={8}
      />
      
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>PIN 解鎖保護</Label>
            <p className="text-sm">啟用後玩家需輸入 PIN 才能查看角色卡</p>
          </div>
          <Switch 
            checked={formData.hasPinLock}
            onCheckedChange={handlePinLockToggle}
          />
        </div>
      </div>
      
      {formData.hasPinLock && (
        <div className="p-4 border rounded-lg">
          <Label>
            {character.hasPinLock ? '新 PIN 碼（留空保持不變）' : 'PIN 碼 *'}
          </Label>
          <Input 
            type={showPin ? 'text' : 'password'}
            inputMode="numeric"
            pattern="[0-9]{4,6}"
            placeholder="4-6 位數字"
            value={formData.pin}
            onChange={handlePinChange}
            required={formData.hasPinLock && !character.hasPinLock}
          />
          <Button 
            type="button" 
            onClick={() => setShowPin(!showPin)}
          >
            {showPin ? '🙈' : '👁️'}
          </Button>
        </div>
      )}
    </CardContent>
  </Card>
  
  <FormActions>
    <Button type="button" variant="outline" onClick={() => router.back()}>
      取消
    </Button>
    <Button type="submit" disabled={isLoading}>
      {isLoading ? '儲存中...' : '💾 儲存變更'}
    </Button>
  </FormActions>
</form>
```

**Server Action**
- `getCharacterById(characterId)` - 取得角色資料
- `updateCharacter(characterId, data)` - 更新角色基本資訊
- `getCharacterPin(characterId)` - 取得角色 PIN（GM 專用）

**Phase 4 擴展規劃**
- `updateCharacterStats(characterId, stats)` - 更新角色數值
- `addItem(characterId, item)` - 新增道具
- `removeItem(characterId, itemId)` - 移除道具
- `addSkill(characterId, skill)` - 新增技能
- `removeSkill(characterId, skillId)` - 移除技能
- `addTask(characterId, task)` - 新增任務
- `updateTask(characterId, taskId, updates)` - 更新任務狀態

---

### 2.8 個人設定頁 (`/profile`)

**佈局結構（Phase 3 更新：統一佈局）**
```tsx
<PageLayout
  header={
    <div className="space-y-2">
      <h1 className="text-3xl font-bold">個人設定</h1>
      <p className="text-muted-foreground">管理您的 GM 帳號資訊</p>
    </div>
  }
  maxWidth="lg"
>
  <ProfileContent />
</PageLayout>
```

**功能**
- 顯示 GM 帳號資訊（顯示名稱、Email、註冊時間、最後登入）
- 目前僅支援查看，編輯功能將在後續版本推出

**Server Action**
- `getCurrentGMUser()` - 取得當前 GM 使用者資訊

---

### 2.9 事件推送介面 (`/games/[gameId]/events`)

**功能**
- 廣播事件（全劇本）
- 發送私訊（特定角色）
- 解鎖秘密
- 新增任務/道具

**元件組成**
```tsx
<EventsPage>
  <Header />
  <Tabs defaultValue="broadcast">
    <TabsList>
      <TabsTrigger value="broadcast">廣播訊息</TabsTrigger>
      <TabsTrigger value="message">角色私訊</TabsTrigger>
      <TabsTrigger value="task">任務管理</TabsTrigger>
      <TabsTrigger value="item">道具管理</TabsTrigger>
    </TabsList>
    
    <TabsContent value="broadcast">
      <BroadcastForm>
        <Input label="標題" name="title" />
        <Textarea label="訊息內容" name="message" />
        <Select label="優先級" name="priority">
          <Option value="low">低</Option>
          <Option value="normal">一般</Option>
          <Option value="high">高</Option>
        </Select>
        <Button type="submit">發送廣播</Button>
      </BroadcastForm>
    </TabsContent>
    
    <TabsContent value="message">
      <MessageForm>
        <Select label="目標角色" name="characterId">
          {characters.map(char => (
            <Option key={char._id} value={char._id}>
              {char.name}
            </Option>
          ))}
        </Select>
        <Input label="標題" name="title" />
        <Textarea label="訊息內容" name="message" />
        <Button type="submit">發送私訊</Button>
      </MessageForm>
    </TabsContent>
    
    <TabsContent value="task">
      <TaskManagementPanel />
    </TabsContent>
    
    <TabsContent value="item">
      <ItemManagementPanel />
    </TabsContent>
  </Tabs>
  
  <EventHistory>
    <h3>推送歷史</h3>
    {/* 顯示最近推送的事件 */}
  </EventHistory>
</EventsPage>
```

**Server Action**
- `pushEvent(eventData)` - 推送事件

---

## 3. 共用元件設計

### 3.1 Header

```tsx
<Header>
  <Logo />
  <Nav>
    <NavLink href="/dashboard">主控台</NavLink>
  </Nav>
  <UserMenu>
    <DropdownMenu>
      <MenuItem href="/profile">個人設定</MenuItem>
      <MenuItem onClick={logout}>登出</MenuItem>
    </DropdownMenu>
  </UserMenu>
</Header>
```

### 3.2 ImageUpload

```tsx
<ImageUpload
  label="上傳圖片"
  accept="image/jpeg,image/png"
  maxSize={5 * 1024 * 1024}  // 5MB
  onUpload={async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const { url } = await res.json();
    return url;
  }}
/>
```

### 3.3 QRCodeGenerator

```tsx
<QRCodeGenerator
  value={`https://larp-nexus.vercel.app/c/${characterId}`}
  size={200}
  downloadable
/>
```

---

## 4. 狀態管理架構

### 4.1 Jotai Atoms

```typescript
// store/auth.ts
export const gmUserAtom = atom<GMUser | null>(null);
export const isAuthenticatedAtom = atom((get) => !!get(gmUserAtom));

// store/game.ts
export const currentGameAtom = atom<Game | null>(null);
export const gamesListAtom = atom<Game[]>([]);

// store/character.ts
export const charactersAtom = atom<Character[]>([]);
```

### 4.2 使用範例

```tsx
function DashboardPage() {
  const [games, setGames] = useAtom(gamesListAtom);
  
  useEffect(() => {
    getGames().then(setGames);
  }, []);
  
  return <GameList games={games} />;
}
```

---

## 5. 響應式設計

### 5.1 Breakpoints

```
lg: 1024px  - 最小支援解析度
xl: 1280px  - 標準桌面
2xl: 1536px - 大螢幕
```

### 5.2 佈局適配

```tsx
<div className="container mx-auto px-4 lg:px-8">
  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
    {/* Cards */}
  </div>
</div>
```

---

## 6. UX 設計原則

1. **快速存取**：常用功能置於明顯位置
2. **確認機制**：刪除操作需二次確認
3. **即時回饋**：Loading 狀態、Success/Error Toast
4. **鍵盤快捷鍵**：支援常用操作（如 Ctrl+S 儲存）
5. **離開提醒**：表單未儲存時離開需提示

---

## 附註

- 所有表單需實作驗證（client-side + server-side）
- 圖片上傳需顯示進度條
- 長列表需實作分頁或虛擬滾動
- 重要操作需記錄 audit log

此文件將隨需求變更持續更新。

