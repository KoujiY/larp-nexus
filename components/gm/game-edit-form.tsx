'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateGame } from '@/app/actions/games';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { X, Plus } from 'lucide-react';
import type { GameData } from '@/types/game';

interface GameEditFormProps {
  game: GameData;
}

export function GameEditForm({ game }: GameEditFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: game.name,
    description: game.description || '',
    isActive: game.isActive,
    publicInfo: {
      intro: game.publicInfo?.intro || '',
      worldSetting: game.publicInfo?.worldSetting || '',
      chapters: game.publicInfo?.chapters || [],
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const updateData = {
        name: formData.name,
        description: formData.description,
        isActive: formData.isActive,
        publicInfo: {
          intro: formData.publicInfo.intro,
          worldSetting: formData.publicInfo.worldSetting,
          chapters: formData.publicInfo.chapters,
        },
      };

      const result = await updateGame(game.id, updateData);

      if (result.success) {
        toast.success('劇本更新成功！');
        router.refresh();
      } else {
        toast.error(result.message || '更新失敗');
      }
    } catch (err) {
      console.error('Error updating game:', err);
      toast.error('發生錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 基本資訊 */}
      <Card>
        <CardHeader>
          <CardTitle>基本資訊</CardTitle>
          <CardDescription>
            設定劇本的名稱、描述與狀態
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              劇本名稱 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              disabled={isLoading}
              required
              placeholder="例：維多利亞時代的謎案"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">劇本描述</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              disabled={isLoading}
              rows={5}
              className="resize-none"
              placeholder="輸入劇本的簡介、類型、適合人數等..."
            />
            <p className="text-xs text-muted-foreground">
              建議不超過 300 字
            </p>
          </div>

          <div className="flex items-center justify-between py-3 px-4 rounded-lg border bg-muted/30">
            <div className="space-y-0.5">
              <Label htmlFor="isActive" className="text-base font-medium">
                劇本狀態
              </Label>
              <p className="text-sm text-muted-foreground">
                停用後將無法建立新角色
              </p>
            </div>
            <Switch
              id="isActive"
              checked={formData.isActive}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, isActive: checked }))
              }
              disabled={isLoading}
            />
          </div>
        </CardContent>
      </Card>

      {/* 公開資訊 */}
      <Card>
        <CardHeader>
          <CardTitle>公開資訊</CardTitle>
          <CardDescription>
            設定劇本的世界觀、前導故事與章節（所有玩家可見）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="worldSetting">世界觀</Label>
            <Textarea
              id="worldSetting"
              value={formData.publicInfo.worldSetting}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  publicInfo: {
                    ...prev.publicInfo,
                    worldSetting: e.target.value,
                  },
                }))
              }
              disabled={isLoading}
              rows={8}
              className="resize-none"
              placeholder="輸入劇本的世界觀設定、背景、規則等..."
            />
            <p className="text-xs text-muted-foreground">
              可輸入多行文字，建議不超過 3000 字
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="intro">前導故事</Label>
            <Textarea
              id="intro"
              value={formData.publicInfo.intro}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  publicInfo: {
                    ...prev.publicInfo,
                    intro: e.target.value,
                  },
                }))
              }
              disabled={isLoading}
              rows={8}
              className="resize-none"
              placeholder="輸入劇本的前導故事、開場情境等..."
            />
            <p className="text-xs text-muted-foreground">
              可輸入多行文字，建議不超過 2000 字
            </p>
          </div>

          <div className="space-y-2">
            <Label>章節</Label>
            <div className="space-y-3">
              {formData.publicInfo.chapters
                .sort((a, b) => a.order - b.order)
                .map((chapter, index) => (
                  <div
                    key={index}
                    className="flex gap-2 p-3 rounded-lg border bg-card"
                  >
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          placeholder="順序"
                          value={chapter.order}
                          onChange={(e) => {
                            const newChapters = [...formData.publicInfo.chapters];
                            const chapterIndex = newChapters.findIndex(
                              (c) => c === chapter
                            );
                            if (chapterIndex !== -1) {
                              newChapters[chapterIndex] = {
                                ...newChapters[chapterIndex],
                                order: parseInt(e.target.value) || 0,
                              };
                              setFormData((prev) => ({
                                ...prev,
                                publicInfo: {
                                  ...prev.publicInfo,
                                  chapters: newChapters,
                                },
                              }));
                            }
                          }}
                          disabled={isLoading}
                          className="w-20"
                        />
                        <Input
                          placeholder="章節標題"
                          value={chapter.title}
                          onChange={(e) => {
                            const newChapters = [...formData.publicInfo.chapters];
                            const chapterIndex = newChapters.findIndex(
                              (c) => c === chapter
                            );
                            if (chapterIndex !== -1) {
                              newChapters[chapterIndex] = {
                                ...newChapters[chapterIndex],
                                title: e.target.value,
                              };
                              setFormData((prev) => ({
                                ...prev,
                                publicInfo: {
                                  ...prev.publicInfo,
                                  chapters: newChapters,
                                },
                              }));
                            }
                          }}
                          disabled={isLoading}
                        />
                      </div>
                      <Textarea
                        placeholder="章節內容"
                        value={chapter.content}
                        onChange={(e) => {
                          const newChapters = [...formData.publicInfo.chapters];
                          const chapterIndex = newChapters.findIndex(
                            (c) => c === chapter
                          );
                          if (chapterIndex !== -1) {
                            newChapters[chapterIndex] = {
                              ...newChapters[chapterIndex],
                              content: e.target.value,
                            };
                            setFormData((prev) => ({
                              ...prev,
                              publicInfo: {
                                ...prev.publicInfo,
                                chapters: newChapters,
                              },
                            }));
                          }
                        }}
                        disabled={isLoading}
                        rows={4}
                        className="resize-none"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const newChapters = formData.publicInfo.chapters.filter(
                          (c) => c !== chapter
                        );
                        setFormData((prev) => ({
                          ...prev,
                          publicInfo: {
                            ...prev.publicInfo,
                            chapters: newChapters,
                          },
                        }));
                      }}
                      disabled={isLoading}
                      className="shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const maxOrder = formData.publicInfo.chapters.length > 0
                    ? Math.max(...formData.publicInfo.chapters.map((c) => c.order))
                    : 0;
                  setFormData((prev) => ({
                    ...prev,
                    publicInfo: {
                      ...prev.publicInfo,
                      chapters: [
                        ...prev.publicInfo.chapters,
                        {
                          title: '',
                          content: '',
                          order: maxOrder + 1,
                        },
                      ],
                    },
                  }));
                }}
                disabled={isLoading}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                新增章節
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              可新增多個章節，每個章節包含順序、標題與內容
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end space-x-2">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? '儲存中...' : '💾 儲存變更'}
        </Button>
      </div>
    </form>
  );
}

