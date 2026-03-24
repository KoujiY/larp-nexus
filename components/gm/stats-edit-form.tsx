'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { updateCharacter } from '@/app/actions/character-update';
import { useFormGuard } from '@/hooks/use-form-guard';
import { SaveButton } from '@/components/gm/save-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import type { Stat } from '@/types/character';

interface StatsEditFormProps {
  characterId: string;
  initialStats: Stat[];
  onDirtyChange?: (dirty: boolean) => void;
}

export function StatsEditForm({ characterId, initialStats, onDirtyChange }: StatsEditFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<Stat[]>(initialStats);
  const [prevInitialStats, setPrevInitialStats] = useState(initialStats);

  /**
   * 當 initialStats props 變化時（例如 router.refresh() 後），同步更新本地 state
   */
  if (initialStats !== prevInitialStats) {
    setPrevInitialStats(initialStats);
    setStats(initialStats);
  }

  const { isDirty, resetDirty } = useFormGuard({
    initialData: initialStats,
    currentData: stats,
  });

  /** 回報 dirty 狀態給父層（用於 tab 切換攔截） */
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  // 新增數值欄位
  const handleAddStat = () => {
    const newStat: Stat = {
      id: `stat-${Date.now()}`,
      name: '',
      value: 0,
      maxValue: undefined,
    };
    setStats([...stats, newStat]);
  };

  // 刪除數值欄位
  const handleRemoveStat = (statId: string) => {
    setStats(stats.filter((s) => s.id !== statId));
  };

  // 更新數值欄位
  const handleStatChange = (
    statId: string,
    field: keyof Stat,
    value: string | number | undefined
  ) => {
    setStats(
      stats.map((s) => {
        if (s.id !== statId) return s;
        
        if (field === 'value' || field === 'maxValue') {
          const numValue = value === '' || value === undefined ? undefined : Number(value);
          return { ...s, [field]: field === 'value' ? (numValue ?? 0) : numValue };
        }
        
        return { ...s, [field]: value };
      })
    );
  };

  // 儲存數值
  const handleSave = async () => {
    // 驗證：所有數值都需要有名稱
    const invalidStats = stats.filter((s) => !s.name.trim());
    if (invalidStats.length > 0) {
      toast.error('所有數值欄位都需要名稱');
      return;
    }

    setIsLoading(true);
    try {
      const result = await updateCharacter(characterId, { stats });

      if (result.success) {
        toast.success('數值已儲存');
        resetDirty();
        router.refresh();
      } else {
        toast.error(result.message || '儲存失敗');
      }
    } catch {
      toast.error('儲存時發生錯誤');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>📊 角色數值</CardTitle>
            <CardDescription>
              定義角色的屬性數值，如血量、魔力、力量等
            </CardDescription>
          </div>
          <SaveButton
            isDirty={isDirty}
            isLoading={isLoading}
            type="button"
            onClick={handleSave}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {stats.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <div className="text-4xl mb-4">📊</div>
            <p className="text-muted-foreground mb-4">
              尚未定義任何數值欄位
            </p>
            <Button onClick={handleAddStat} variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              新增數值欄位
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {stats.map((stat, index) => (
                <div
                  key={stat.id}
                  className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg"
                >
                  <div className="text-muted-foreground cursor-move">
                    <GripVertical className="h-5 w-5" />
                  </div>
                  
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2">
                      <Label htmlFor={`stat-name-${index}`} className="sr-only">
                        數值名稱
                      </Label>
                      <Input
                        id={`stat-name-${index}`}
                        placeholder="數值名稱（如：血量、魔力）"
                        value={stat.name}
                        onChange={(e) =>
                          handleStatChange(stat.id, 'name', e.target.value)
                        }
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor={`stat-value-${index}`} className="sr-only">
                        目前值
                      </Label>
                      <div className="relative">
                        <Input
                          id={`stat-value-${index}`}
                          type="number"
                          placeholder="目前值"
                          value={stat.value}
                          onChange={(e) =>
                            handleStatChange(stat.id, 'value', e.target.value)
                          }
                          className="pr-12"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          目前
                        </span>
                      </div>
                    </div>
                    
                    <div>
                      <Label htmlFor={`stat-max-${index}`} className="sr-only">
                        最大值
                      </Label>
                      <div className="relative">
                        <Input
                          id={`stat-max-${index}`}
                          type="number"
                          placeholder="最大值（選填）"
                          value={stat.maxValue ?? ''}
                          onChange={(e) =>
                            handleStatChange(
                              stat.id,
                              'maxValue',
                              e.target.value === '' ? undefined : e.target.value
                            )
                          }
                          className="pr-12"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          最大
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemoveStat(stat.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            
            <Button
              onClick={handleAddStat}
              variant="outline"
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              新增數值欄位
            </Button>
          </>
        )}

        {/* 使用說明 */}
        <div className="mt-6 p-4 bg-info/10 rounded-lg text-sm text-foreground">
          <h4 className="font-medium mb-2">💡 使用說明</h4>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>數值名稱：自訂欄位名稱，如「血量」、「魔力」、「力量」等</li>
            <li>目前值：角色目前的數值</li>
            <li>最大值：數值上限（選填），用於顯示進度條</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

