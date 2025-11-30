# 玩家端頁面與元件架構

## 版本：v1.0
## 更新日期：2025-11-29

---

## 1. 頁面架構總覽

玩家端採用 **Mobile First** 設計，最小支援解析度 320px。

### 1.1 路由結構

```
/c/[characterId]               # 角色卡主頁
/c/[characterId]?unlock=true   # 顯示 PIN 解鎖畫面
```

**注意**：玩家端僅有單一頁面，所有功能整合於角色卡頁面中。

---

## 2. 角色卡頁面設計 (`/c/[characterId]`)

### 2.1 功能概覽

- 顯示角色基本資訊（頭像、名稱）
- 顯示公開資訊（背景、性格、關係）
- 顯示秘密資訊（需解鎖）
- 顯示任務列表
- 顯示道具列表
- 即時接收 GM 推送的事件
- 顯示劇本公開資訊（世界觀、章節）

### 2.2 頁面狀態

| 狀態 | 條件 | 顯示內容 |
|------|------|----------|
| **Loading** | 初次載入 | Skeleton UI |
| **Not Found** | characterId 不存在 | 404 錯誤頁 |
| **Locked** | `hasPinLock=true` 且未解鎖 | PIN 解鎖介面 |
| **Unlocked** | 無 PIN 或已解鎖 | 完整角色卡 |

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
          <TabsTrigger value="world">世界觀</TabsTrigger>
        </TabsList>
        
        <TabsContent value="info">
          <PublicInfoSection />
          <SecretInfoSection />
        </TabsContent>
        
        <TabsContent value="tasks">
          <TaskList />
        </TabsContent>
        
        <TabsContent value="items">
          <ItemList />
        </TabsContent>
        
        <TabsContent value="world">
          <WorldInfoSection />
        </TabsContent>
      </Tabs>
      
      <EventNotifications />
    </>
  )}
</CharacterPage>
```

---

## 4. 元件詳細設計

### 4.1 PIN 解鎖畫面 (PinUnlockScreen)

**功能**
- 輸入 4 位數 PIN 碼
- 顯示錯誤提示
- 防暴力破解（5 次錯誤後鎖定 5 分鐘）

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

**狀態管理**
```typescript
const [pin, setPin] = useState('');
const [error, setError] = useState('');
const [attemptCount, setAttemptCount] = useState(0);
const [isLocked, setIsLocked] = useState(false);
const [remainingTime, setRemainingTime] = useState(0);
```

**解鎖邏輯**
```typescript
async function handleUnlock(pin: string) {
  try {
    const res = await fetch(`/api/characters/${characterId}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    
    if (res.ok) {
      const { secretInfo } = await res.json();
      setIsUnlocked(true);
      setSecretInfo(secretInfo);
      showToast('解鎖成功', 'success');
    } else {
      setAttemptCount(prev => prev + 1);
      setError('PIN 碼錯誤');
      
      if (attemptCount >= 4) {
        setIsLocked(true);
        setRemainingTime(300); // 5 分鐘
        startCountdown();
      }
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
  <div className="relative h-48 bg-gradient-to-b from-primary/20 to-background">
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

### 4.4 秘密資訊區 (SecretInfoSection)

```tsx
<SecretInfoSection>
  {secretInfo.isUnlocked ? (
    <>
      <Section title="秘密資訊" icon={Lock} variant="secret">
        {secretInfo.secrets.map((secret, index) => (
          <Accordion key={index} type="single" collapsible>
            <AccordionItem value={`secret-${index}`}>
              <AccordionTrigger>{secret.title}</AccordionTrigger>
              <AccordionContent>
                <p className="whitespace-pre-wrap">{secret.content}</p>
                {secret.revealedAt && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    揭露於：{formatDate(secret.revealedAt)}
                  </p>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ))}
      </Section>
      
      <Section title="隱藏目標" icon={Target} variant="secret">
        <p className="whitespace-pre-wrap">{secretInfo.hiddenGoals}</p>
      </Section>
    </>
  ) : (
    <Alert>
      <Lock className="h-4 w-4" />
      <AlertTitle>秘密資訊已鎖定</AlertTitle>
      <AlertDescription>
        此區域將在適當時機由 GM 解鎖
      </AlertDescription>
    </Alert>
  )}
</SecretInfoSection>
```

**解鎖動畫**
```tsx
// 當收到 role.secretUnlocked 事件時觸發
<motion.div
  initial={{ opacity: 0, scale: 0.8 }}
  animate={{ opacity: 1, scale: 1 }}
  transition={{ duration: 0.5 }}
>
  <SecretInfoSection />
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

### 4.8 事件通知 (EventNotifications)

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

