# 玩家端頁面與元件架構

## 版本：v2.0
## 更新日期：2026-03-04（Phase 10 遊戲狀態分層）

---

## 1. 頁面架構總覽

玩家端採用 **Mobile First** 設計，最小支援解析度 320px。

### 1.1 路由結構

```
/g/[gameId]                   # 世界觀公開頁（所有玩家可訪問）
/c/[characterId]               # 角色卡主頁（Phase 10：統一入口）
/unlock                        # Legacy 解鎖頁面（Phase 10 後標記為 legacy）
```

**Phase 10 變更**：
- `/c/[characterId]` 現為唯一的玩家端入口（QR Code / 直接連結）
- 不再需要 `/unlock` 作為主要入口
- 角色卡頁面內建 PinUnlock 組件，支援三種解鎖模式

---

## 2. 角色卡頁面設計 (`/c/[characterId]`)

### 2.1 功能概覽（Phase 3）

- 顯示角色基本資訊（頭像、名稱）
- 顯示公開資訊（背景、性格、關係）- **PIN 解鎖後可見**
- 顯示任務列表
- 顯示道具列表
- 提供連結至世界觀頁面（`/g/[gameId]`）

**Phase 3 不包含**：
- SecretInfo 顯示（延後至 Phase 3.5）
- 即時事件接收（延後至 Phase 6）
- 數值系統（延後至 Phase 4）
- 技能系統（延後至 Phase 5）
- 世界觀資訊直接顯示（改為獨立頁面）

### 2.2 頁面狀態（Phase 10 更新）

| 狀態 | 條件 | 顯示內容 |
|------|------|----------|
| **Loading** | 初次載入 | Skeleton UI |
| **Not Found** | characterId 不存在 | 404 錯誤頁 |
| **Locked** | `hasPinLock=true` 且未解鎖 | PinUnlock 組件（Game Code + PIN / PIN-only） |
| **Read-Only** | PIN-only 解鎖（無 `fullAccess`） | Baseline 資料預覽，互動功能禁用 |
| **Full Access** | Game Code + PIN 解鎖且遊戲進行中 | Runtime 資料，完整互動模式 |
| **No PIN Lock** | `hasPinLock=false` | 直接顯示角色卡（完整互動或 Baseline） |

**Phase 10 關鍵概念**：
- **Baseline**：設定階段的原始資料（遊戲未開始或唯讀模式時顯示）
- **Runtime**：遊戲進行中的即時資料（Full Access 模式時顯示）
- `localStorage` 使用 `character-{id}-unlocked` 和 `character-{id}-fullAccess` 管理解鎖狀態

---

## 3. 頁面元件組成

### 3.1 整體結構

```tsx
<CharacterPage>
  {/* 如果需要 PIN 且未解鎖 */}
  {hasPinLock && !isUnlocked && <PinUnlockScreen />}
  
  {/* 解鎖後顯示角色卡 */}
  {isUnlocked && (
    <>
      <CharacterHeader />
      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">資訊</TabsTrigger>
          <TabsTrigger value="tasks">任務</TabsTrigger>
          <TabsTrigger value="items">道具</TabsTrigger>
        </TabsList>
        
        <TabsContent value="info">
          <PublicInfoSection />
          {/* SecretInfoSection 延後至 Phase 3.5 */}
        </TabsContent>
        
        <TabsContent value="tasks">
          <TaskList />
        </TabsContent>
        
        <TabsContent value="items">
          <ItemList />
        </TabsContent>
      </Tabs>
      
      {/* 世界觀連結 */}
      <WorldInfoLink gameId={character.gameId} />
      
      {/* EventNotifications 延後至 Phase 6 */}
    </>
  )}
</CharacterPage>
```

---

## 4. 元件詳細設計

### 4.1 PIN 解鎖畫面 (PinUnlockScreen)

> **Phase 10 重大變更**：PinUnlock 組件已重新設計，支援三種解鎖模式。以下為 Phase 10 版本。

**功能（Phase 10）**
- **模式 A — Game Code + PIN**：輸入 6 碼英數字 Game Code 和 4-6 碼 PIN → 進入完整互動模式（Full Access）
- **模式 B — PIN Only**：僅輸入 PIN → 進入唯讀預覽模式（Read-Only，顯示 Baseline 資料）
- **模式 C — 無 PIN Lock**：`hasPinLock=false` 的角色直接顯示角色卡

**解鎖流程**
```
PinUnlock 組件
├── Game Code 輸入欄位（自動轉大寫，限制 6 碼）
├── PIN 輸入欄位（限制數字 4-6 碼）
├── 「🔓 解鎖角色卡」按鈕 → Server Action: verify-game-code
│   ├── 成功且遊戲已開始 → Full Access（localStorage 儲存 unlocked + fullAccess）
│   ├── Game Code 錯誤 → 顯示「遊戲代碼不正確」
│   ├── PIN 錯誤 → 顯示「PIN 碼錯誤」
│   └── 遊戲尚未開始 → 顯示「遊戲尚未開始，請等待 GM 開始遊戲後再試」
└── 「👁 僅使用 PIN 預覽（唯讀）」按鈕 → Server Action: verify-pin
    ├── 成功 → Read-Only（localStorage 僅儲存 unlocked，無 fullAccess）
    └── PIN 錯誤 → 顯示「PIN 碼錯誤」
```

**唯讀模式 UI**
- 頂部顯示預覽模式 banner：「預覽模式（Baseline）」+「查看角色的原始設定」
- Banner 內含「🔑 重新解鎖」按鈕，可回到 PinUnlock 重新輸入 Game Code
- 所有互動功能禁用（道具使用、技能觸發、對抗檢定等按鈕呈 disabled 狀態）
- 顯示 Baseline 資料（不受 Runtime 修改影響）

**完整互動模式 UI**
- 角色名稱旁有「🔓 已解鎖」Badge 和「🔒 鎖定」按鈕
- 點擊「🔒 鎖定」→ 清除 localStorage → 回到 PinUnlock 畫面
- 顯示 Runtime 資料（遊戲進行中的即時數值）

**WebSocket 事件處理（Phase 10）**
- `game.started`：靜默 `router.refresh()`（不顯示通知，因此時玩家在唯讀模式）
- `game.ended`：顯示「遊戲已結束，感謝您的參與！」Dialog → 確認後回到 PinUnlock
- `game.reset`：顯示通知 + `router.refresh()`

**注意**：
- 唯讀模式的持久化完全依賴 `localStorage`（`isReadOnly = isReadOnlyProp || !storageFullAccess`）
- 頁面重新整理後自動恢復解鎖狀態（無需重新輸入）

**設計**
```tsx
<PinUnlockScreen>
  <Container className="flex min-h-screen items-center justify-center p-4">
    <Card className="w-full max-w-md">
      <CardHeader>
        <Avatar src={character.avatar} size="lg" className="mx-auto" />
        <h1 className="text-center text-2xl font-bold">
          {character.name}
        </h1>
        <p className="text-center text-muted-foreground">
          請輸入 PIN 碼解鎖角色卡
        </p>
      </CardHeader>
      
      <CardContent>
        <PinInput
          length={4}
          value={pin}
          onChange={setPin}
          onComplete={handleUnlock}
          error={error}
        />
        
        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {isLocked && (
          <Alert className="mt-4">
            <AlertDescription>
              錯誤次數過多，請於 {remainingTime} 後再試
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  </Container>
</PinUnlockScreen>
```

**狀態管理（Phase 3）**
```typescript
const [pin, setPin] = useState('');
const [error, setError] = useState('');
```

**解鎖邏輯（Phase 3）**
```typescript
async function handleUnlock(pin: string) {
  try {
    const res = await fetch(`/api/characters/${characterId}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    
    if (res.ok) {
      setIsUnlocked(true);
      // 解鎖成功後顯示角色卡（PublicInfo、任務、道具、世界觀）
      showToast('解鎖成功', 'success');
    } else {
      setError('PIN 碼錯誤');
      setPin(''); // 清空輸入
    }
  } catch (error) {
    setError('解鎖失敗，請稍後再試');
  }
}
```

---

### 4.2 角色卡頁首 (CharacterHeader)

```tsx
<CharacterHeader>
    <div className="relative h-48 bg-linear-to-b from-primary/20 to-background">
    <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
      <Avatar src={character.avatar} size="xl" className="border-4 border-background" />
    </div>
  </div>
  
  <div className="mt-14 px-4 text-center">
    <h1 className="text-3xl font-bold">{character.name}</h1>
    {character.publicInfo.personality && (
      <p className="mt-2 text-muted-foreground">
        {character.publicInfo.personality}
      </p>
    )}
  </div>
</CharacterHeader>
```

---

### 4.3 公開資訊區 (PublicInfoSection)

```tsx
<PublicInfoSection>
  <Section title="角色背景" icon={BookOpen}>
    <p className="whitespace-pre-wrap">{character.publicInfo.background}</p>
  </Section>
  
  <Section title="人物關係" icon={Users}>
    <RelationshipGrid>
      {character.publicInfo.relationships.map((rel, index) => (
        <RelationshipCard key={index}>
          <h4 className="font-semibold">{rel.targetName}</h4>
          <p className="text-sm text-muted-foreground">{rel.description}</p>
        </RelationshipCard>
      ))}
    </RelationshipGrid>
  </Section>
</PublicInfoSection>
```

---

### 4.4 隱藏資訊區 (SecretInfoSection)

**Phase 3.5 功能**（Phase 3 不包含）

**核心設計原則**：
1. **完全隱藏原則**：未揭露的隱藏資訊完全不顯示任何內容（包括鎖定提示），玩家不會知道有隱藏資訊存在
2. **獨立揭露**：每個隱藏資訊獨立控制揭露狀態，GM 可以選擇性地揭露特定隱藏資訊
3. **閱讀狀態追蹤**：每個隱藏資訊會標記是否已閱讀，使用 localStorage 儲存閱讀狀態
4. **Dialog 顯示**：點擊隱藏資訊卡片後，以 Dialog 視窗顯示完整內容，並標記為已閱讀

**元件結構**
```tsx
<SecretInfoSection secretInfo={character.secretInfo} characterId={character.id}>
  {/* 只顯示已揭露的隱藏資訊（isRevealed === true） */}
  {revealedSecrets.length > 0 && (
    <Card className="border-purple-300 bg-purple-50/50">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Lock className="mr-2 h-5 w-5" />
          隱藏資訊
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {revealedSecrets.map((secret) => {
            const isRead = readSecrets.has(secret.id);
            return (
              <Card
                key={secret.id}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  isRead ? 'opacity-75' : 'border-purple-400 bg-purple-100/50'
                }`}
                onClick={() => handleSecretClick(secret.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-semibold">{secret.title}</h4>
                    {!isRead && (
                      <Badge variant="secondary">
                        <Eye className="h-3 w-3 mr-1" />
                        未讀
                      </Badge>
                    )}
                  </div>
                  {secret.revealCondition && (
                    <p className="text-xs text-muted-foreground mb-2">
                      揭露條件：{secret.revealCondition}
                    </p>
                  )}
                  {secret.revealedAt && (
                    <p className="text-xs text-muted-foreground">
                      揭露於：{formatDate(secret.revealedAt)}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  )}
  
  {/* Dialog 顯示隱藏資訊完整內容 */}
  <Dialog open={selectedSecret !== null}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{selectedSecretData?.title}</DialogTitle>
        <DialogDescription>
          {selectedSecretData?.revealCondition && (
            <span>揭露條件：{selectedSecretData.revealCondition}</span>
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="mt-4">
        <p className="whitespace-pre-wrap">{selectedSecretData?.content}</p>
        {selectedSecretData?.revealedAt && (
          <p className="mt-4 text-xs text-muted-foreground">
            揭露於：{formatDate(selectedSecretData.revealedAt)}
          </p>
        )}
      </div>
    </DialogContent>
  </Dialog>
</SecretInfoSection>
```

**狀態管理**
```typescript
// 閱讀狀態追蹤（使用 localStorage）
const [readSecrets, setReadSecrets] = useState<Set<string>>(new Set());
const [selectedSecret, setSelectedSecret] = useState<string | null>(null);

// 從 localStorage 載入已閱讀的隱藏資訊 ID
useEffect(() => {
  const stored = localStorage.getItem(`character-${characterId}-read-secrets`);
  if (stored) {
    const readIds = JSON.parse(stored) as string[];
    setReadSecrets(new Set(readIds));
  }
}, [characterId]);

// 點擊隱藏資訊時標記為已閱讀
const handleSecretClick = (secretId: string) => {
  setSelectedSecret(secretId);
  const newReadSecrets = new Set(readSecrets);
  newReadSecrets.add(secretId);
  setReadSecrets(newReadSecrets);
  localStorage.setItem(
    `character-${characterId}-read-secrets`,
    JSON.stringify(Array.from(newReadSecrets))
  );
};
```

**過濾邏輯**
```typescript
// 只顯示已揭露的隱藏資訊
const revealedSecrets = secretInfo?.secrets?.filter(
  (secret) => secret.isRevealed === true
) || [];

// 如果沒有已揭露的隱藏資訊，不顯示任何內容（包括鎖定提示）
if (revealedSecrets.length === 0) {
  return null;
}
```

**注意事項**：
- **完全隱藏原則**：未揭露的隱藏資訊不顯示任何 UI 元素，玩家完全不知道有隱藏資訊存在
- **獨立揭露**：每個隱藏資訊的 `isRevealed` 狀態獨立控制，GM 可以選擇性地揭露
- **閱讀狀態**：使用 `localStorage` 儲存閱讀狀態，格式為 `character-{characterId}-read-secrets`
- **揭露條件**：`revealCondition` 僅供 GM 參考，玩家可以看到此欄位（用於說明揭露時機）
- **揭露時間**：當 GM 將 `isRevealed` 從 `false` 變為 `true` 時，自動設定 `revealedAt` 為當前時間
- **Dialog 顯示**：點擊隱藏資訊卡片後，以 Dialog 視窗顯示完整內容，並自動標記為已閱讀

**解鎖動畫（Phase 6）**
```tsx
// 當收到 role.secretRevealed 事件時觸發（單個隱藏資訊揭露）
<motion.div
  initial={{ opacity: 0, scale: 0.8 }}
  animate={{ opacity: 1, scale: 1 }}
  transition={{ duration: 0.5 }}
>
  <SecretInfoCard secret={newRevealedSecret} />
</motion.div>
```

---

### 4.5 任務列表 (TaskList)

```tsx
<TaskList>
  {tasks.length === 0 ? (
    <EmptyState
      icon={ClipboardList}
      title="目前沒有任務"
      description="GM 會在適當時機分配任務給你"
    />
  ) : (
    <div className="space-y-3">
      {tasks.map(task => (
        <TaskCard key={task.id} task={task}>
          <div className="flex items-start gap-3">
            <Checkbox
              checked={task.status === 'completed'}
              disabled
              className="mt-1"
            />
            <div className="flex-1">
              <h4 className="font-semibold">{task.title}</h4>
              <p className="text-sm text-muted-foreground">
                {task.description}
              </p>
              <Badge variant={getStatusVariant(task.status)} className="mt-2">
                {getStatusLabel(task.status)}
              </Badge>
            </div>
          </div>
        </TaskCard>
      ))}
    </div>
  )}
</TaskList>
```

**任務新增動畫**
```tsx
// 當收到 role.taskUpdated (action=added) 時
<motion.div
  initial={{ opacity: 0, x: -20 }}
  animate={{ opacity: 1, x: 0 }}
  transition={{ duration: 0.3 }}
>
  <TaskCard task={newTask} isNew />
</motion.div>
```

---

### 4.6 道具列表 (ItemList)

```tsx
<ItemList>
  {items.length === 0 ? (
    <EmptyState
      icon={Package}
      title="背包是空的"
      description="你還沒有獲得任何道具"
    />
  ) : (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {items.map(item => (
        <ItemCard key={item.id} item={item}>
          <div className="aspect-square overflow-hidden rounded-lg bg-muted">
            {item.imageUrl ? (
              <Image
                src={item.imageUrl}
                alt={item.name}
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Package className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
          </div>
          <h4 className="mt-2 font-semibold">{item.name}</h4>
          <p className="text-xs text-muted-foreground">{item.description}</p>
        </ItemCard>
      ))}
    </div>
  )}
</ItemList>
```

**道具獲得動畫**
```tsx
// 當收到 role.inventoryUpdated (action=added) 時
<Dialog open={showItemDialog}>
  <DialogContent className="text-center">
    <motion.div
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', duration: 0.8 }}
    >
      <Package className="mx-auto h-16 w-16 text-primary" />
    </motion.div>
    <DialogTitle>獲得道具</DialogTitle>
    <DialogDescription>
      <p className="text-lg font-semibold">{newItem.name}</p>
      <p className="mt-2">{newItem.description}</p>
    </DialogDescription>
  </DialogContent>
</Dialog>
```

---

### 4.7 世界觀資訊 (WorldInfoSection)

```tsx
<WorldInfoSection>
  <Section title="世界觀" icon={Globe}>
    <p className="whitespace-pre-wrap">{game.publicInfo.worldSetting}</p>
  </Section>
  
  <Section title="前導故事" icon={BookOpen}>
    <p className="whitespace-pre-wrap">{game.publicInfo.intro}</p>
  </Section>
  
  <Section title="章節" icon={List}>
    <Accordion type="single" collapsible>
      {game.publicInfo.chapters.map((chapter, index) => (
        <AccordionItem key={index} value={`chapter-${index}`}>
          <AccordionTrigger>
            {chapter.order}. {chapter.title}
          </AccordionTrigger>
          <AccordionContent>
            <p className="whitespace-pre-wrap">{chapter.content}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  </Section>
</WorldInfoSection>
```

---

### 4.9 事件通知 (EventNotifications)

**Phase 6 功能**（Phase 3 不包含）

**功能**
- 顯示 GM 推送的即時訊息
- 支援多種通知類型（Toast / Dialog / Full Screen）

```tsx
<EventNotifications>
  {/* Toast 通知（一般訊息） */}
  <Toaster position="top-center" />
  
  {/* Dialog 通知（重要訊息） */}
  <Dialog open={showEventDialog}>
    <DialogContent>
      <DialogTitle>{currentEvent?.title}</DialogTitle>
      <DialogDescription>{currentEvent?.message}</DialogDescription>
      <DialogFooter>
        <Button onClick={dismissEvent}>知道了</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  
  {/* Full Screen 通知（高優先級廣播） */}
  {showFullScreenEvent && (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="max-w-2xl text-center text-white">
        <h1 className="text-4xl font-bold">{fullScreenEvent.title}</h1>
        <p className="mt-4 text-xl">{fullScreenEvent.message}</p>
        <Button
          onClick={dismissFullScreenEvent}
          className="mt-8"
          size="lg"
        >
          知道了
        </Button>
      </div>
    </motion.div>
  )}
</EventNotifications>
```

---

## 5. WebSocket 整合

**Phase 6 功能**（Phase 3 不包含）

### 5.1 Hook 實作

```tsx
// hooks/use-character-websocket.ts
export function useCharacterWebSocket(characterId: string) {
  const [character, setCharacter] = useAtom(characterAtom);
  const { toast } = useToast();
  
  useEffect(() => {
    const pusher = initPusher();
    const channel = pusher.subscribe(`private-character-${characterId}`);
    
    // 角色更新
    channel.bind('role.updated', (event: RoleUpdatedEvent) => {
      setCharacter(prev => ({
        ...prev,
        ...event.payload.updates,
      }));
      toast({ title: '角色資訊已更新' });
    });
    
    // 秘密解鎖
    channel.bind('role.secretUnlocked', (event: SecretUnlockedEvent) => {
      setCharacter(prev => ({
        ...prev,
        secretInfo: {
          ...event.payload.secretInfo,
          isUnlocked: true,
        },
      }));
      showSecretUnlockedAnimation();
      toast({ title: '秘密已解鎖', description: '新的秘密資訊已開放' });
    });
    
    // 私訊
    channel.bind('role.message', (event: RoleMessageEvent) => {
      toast({
        title: event.payload.title,
        description: event.payload.message,
        variant: event.payload.style,
      });
    });
    
    // 任務更新
    channel.bind('role.taskUpdated', (event: TaskUpdatedEvent) => {
      if (event.payload.action === 'added') {
        setCharacter(prev => ({
          ...prev,
          tasks: [...prev.tasks, event.payload.task],
        }));
        showNewTaskAnimation(event.payload.task);
        toast({ title: '新任務', description: event.payload.task.title });
      }
    });
    
    // 道具更新
    channel.bind('role.inventoryUpdated', (event: InventoryUpdatedEvent) => {
      if (event.payload.action === 'added') {
        setCharacter(prev => ({
          ...prev,
          items: [...prev.items, event.payload.item],
        }));
        showItemAcquiredDialog(event.payload.item);
      }
    });
    
    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`private-character-${characterId}`);
    };
  }, [characterId]);
}
```

---

## 6. 狀態管理

### 6.1 Jotai Atoms

```typescript
// store/character.ts
export const characterAtom = atom<Character | null>(null);
export const isUnlockedAtom = atom((get) => {
  const character = get(characterAtom);
  return !character?.hasPinLock || character?.secretInfo.isUnlocked;
});
export const pendingTasksAtom = atom((get) => {
  const character = get(characterAtom);
  return character?.tasks.filter(t => t.status !== 'completed') || [];
});
```

---

## 7. 響應式設計

### 7.1 Breakpoints

```
xs: 320px   - 最小支援
sm: 640px   - 小平板
md: 768px   - 平板
lg: 1024px  - 桌面（可選）
```

### 7.2 佈局適配

```tsx
<div className="container mx-auto max-w-2xl px-4 py-6">
  {/* Mobile: 單欄 */}
  {/* Tablet+: 最大寬度限制，保持可讀性 */}
</div>
```

---

## 8. 效能優化

### 8.1 圖片優化

```tsx
<Image
  src={character.avatar}
  alt={character.name}
  width={200}
  height={200}
  priority  // 頭像優先載入
/>
```

### 8.2 Lazy Loading

```tsx
const WorldInfoSection = lazy(() => import('@/components/player/world-info-section'));

<Suspense fallback={<Skeleton />}>
  <WorldInfoSection />
</Suspense>
```

---

## 9. 離線支援（未來考慮）

使用 Service Worker 快取角色卡資料：

- 快取角色基本資訊
- 快取頭像與道具圖片
- 離線時顯示最後一次載入的資料

---

## 10. UX 設計原則

1. **快速載入**：初次載入 < 1 秒
2. **流暢動畫**：60 FPS
3. **即時回饋**：WebSocket 事件立即顯示
4. **易讀性**：適當的行距、字體大小
5. **沉浸感**：精美的動畫與視覺效果

---

## 附註

- 所有文字需支援多行顯示（`whitespace-pre-wrap`）
- 圖片需提供 fallback placeholder
- 長內容需實作滾動優化
- 支援深色模式（可選）

此文件將隨需求變更持續更新。

