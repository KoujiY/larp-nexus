# GM 端頁面與元件架構

## 版本：v1.0
## 更新日期：2025-11-29

---

## 1. 頁面架構總覽

GM 端採用 **Desktop First** 設計，最小支援解析度 1024px。

### 1.1 路由結構

```
/login                              # 登入頁
/verify                             # Email 驗證頁
/dashboard                          # 主控台（劇本總覽）
/games/new                          # 建立劇本
/games/[gameId]                     # 劇本詳情 Dashboard
/games/[gameId]/characters          # 角色管理列表
/games/[gameId]/characters/new      # 建立角色
/games/[gameId]/characters/[charId] # 編輯角色
/games/[gameId]/events              # 事件推送介面
/games/[gameId]/settings            # 劇本設定
/profile                            # GM 個人設定
```

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

### 2.6 角色管理列表 (`/games/[gameId]/characters`)

**功能**
- 顯示所有角色
- 快速建立新角色
- 角色搜尋
- 複製角色 URL / QR Code

**元件組成**
```tsx
<CharactersPage>
  <Header>
    <h1>角色管理</h1>
    <Button href={`/games/${gameId}/characters/new`}>
      建立角色
    </Button>
  </Header>
  
  <SearchBar />
  
  <CharacterTable>
    <TableHeader>
      <TableColumn>頭像</TableColumn>
      <TableColumn>名稱</TableColumn>
      <TableColumn>PIN 鎖定</TableColumn>
      <TableColumn>玩家 URL</TableColumn>
      <TableColumn>操作</TableColumn>
    </TableHeader>
    <TableBody>
      {characters.map(char => (
        <TableRow key={char._id}>
          <TableCell>
            <Avatar src={char.avatar} />
          </TableCell>
          <TableCell>{char.name}</TableCell>
          <TableCell>
            {char.hasPinLock ? <Lock /> : <Unlock />}
          </TableCell>
          <TableCell>
            <URLDisplay url={`/c/${char._id}`}>
              <CopyButton />
              <QRCodeButton />
            </URLDisplay>
          </TableCell>
          <TableCell>
            <DropdownMenu>
              <MenuItem href={`/games/${gameId}/characters/${char._id}`}>
                編輯
              </MenuItem>
              <MenuItem onClick={() => deleteCharacter(char._id)}>
                刪除
              </MenuItem>
            </DropdownMenu>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </CharacterTable>
</CharactersPage>
```

**Server Action**
- `getCharacters(gameId)` - 取得角色列表
- `deleteCharacter(characterId)` - 刪除角色

---

### 2.7 建立/編輯角色 (`/games/[gameId]/characters/[charId]`)

**功能**
- 角色基本資訊
- 頭像上傳
- 公開/秘密資訊編輯
- PIN 設定
- 任務與道具管理

**元件組成**
```tsx
<CharacterFormPage>
  <Header />
  <CharacterForm>
    <Tabs defaultValue="basic">
      <TabsList>
        <TabsTrigger value="basic">基本資訊</TabsTrigger>
        <TabsTrigger value="public">公開資訊</TabsTrigger>
        <TabsTrigger value="secret">秘密資訊</TabsTrigger>
        <TabsTrigger value="tasks">任務</TabsTrigger>
        <TabsTrigger value="items">道具</TabsTrigger>
      </TabsList>
      
      <TabsContent value="basic">
        <Input label="角色名稱" name="name" required />
        <ImageUpload label="頭像" name="avatar" />
        <Checkbox label="啟用 PIN 鎖定" name="hasPinLock" />
        {hasPinLock && (
          <Input
            label="PIN 碼（4位數字）"
            name="pin"
            type="password"
            maxLength={4}
          />
        )}
      </TabsContent>
      
      <TabsContent value="public">
        <Textarea label="角色背景" name="publicInfo.background" />
        <Textarea label="性格特徵" name="publicInfo.personality" />
        <RelationshipList name="publicInfo.relationships" />
      </TabsContent>
      
      <TabsContent value="secret">
        <SecretList name="secretInfo.secrets" />
        <Textarea label="隱藏目標" name="secretInfo.hiddenGoals" />
        <Switch label="立即解鎖秘密區" name="secretInfo.isUnlocked" />
      </TabsContent>
      
      <TabsContent value="tasks">
        <TaskList tasks={tasks} onAdd={addTask} onUpdate={updateTask} />
      </TabsContent>
      
      <TabsContent value="items">
        <ItemList items={items} onAdd={addItem} onRemove={removeItem} />
      </TabsContent>
    </Tabs>
    
    <FormActions>
      <Button variant="outline" href={`/games/${gameId}/characters`}>
        取消
      </Button>
      <Button type="submit">儲存</Button>
    </FormActions>
  </CharacterForm>
  
  {/* 角色建立成功後顯示 */}
  {characterId && (
    <Dialog open={showSuccessDialog}>
      <DialogContent>
        <h2>角色建立成功！</h2>
        <QRCode value={`${baseUrl}/c/${characterId}`} />
        <Input value={`${baseUrl}/c/${characterId}`} readOnly />
        <CopyButton />
      </DialogContent>
    </Dialog>
  )}
</CharacterFormPage>
```

**Server Action**
- `createCharacter(gameId, data)` - 建立角色
- `updateCharacter(characterId, data)` - 更新角色
- `addTask(characterId, task)` - 新增任務
- `addItem(characterId, item)` - 新增道具

---

### 2.8 事件推送介面 (`/games/[gameId]/events`)

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

