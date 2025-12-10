import { getPublicGame } from '@/app/actions/public';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Globe, BookOpen, List } from 'lucide-react';
import { notFound } from 'next/navigation';
import { useGameWebSocket } from '@/hooks/use-websocket';
import { useState } from 'react';
import { toast } from 'sonner';

interface WorldInfoPageProps {
  params: Promise<{ gameId: string }>;
}

export default async function WorldInfoPage({ params }: WorldInfoPageProps) {
  const { gameId } = await params;

  const result = await getPublicGame(gameId);

  if (!result.success || !result.data) {
    notFound();
  }

  const game = result.data;

  // Client-side subscription for game broadcasts
  // Note: This component is currently server-rendered; to keep minimal changes,
  // inject a tiny client hook via a nested client component.
  const GameWS = () => {
    const [, setTick] = useState(0);
    useGameWebSocket(gameId, (event) => {
      if (event.type === 'game.broadcast') {
        const { title, message } = event.payload as { title?: string; message?: string };
        toast.info(title || '系統廣播', { description: message });
      } else if (event.type === 'game.started' || event.type === 'game.reset' || event.type === 'game.ended') {
        toast.info('遊戲狀態變更', { description: '請刷新以取得最新狀態' });
        setTick((t) => t + 1);
      }
    });
    return null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900">
      <div className="container max-w-4xl mx-auto p-4 md:p-8 min-h-screen">
        <GameWS />
        {/* 頁首 */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">
            {game.name}
          </h1>
          {game.description && (
            <p className="text-purple-200">{game.description}</p>
          )}
        </div>

        {/* 世界觀資訊 */}
        {game.publicInfo?.worldSetting && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Globe className="mr-2 h-5 w-5" />
                世界觀
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{game.publicInfo.worldSetting}</p>
            </CardContent>
          </Card>
        )}

        {/* 前導故事 */}
        {game.publicInfo?.intro && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center">
                <BookOpen className="mr-2 h-5 w-5" />
                前導故事
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{game.publicInfo.intro}</p>
            </CardContent>
          </Card>
        )}

        {/* 章節 */}
        {game.publicInfo?.chapters && game.publicInfo.chapters.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <List className="mr-2 h-5 w-5" />
                章節
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {game.publicInfo.chapters
                  .sort((a, b) => a.order - b.order)
                  .map((chapter, index) => (
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
            </CardContent>
          </Card>
        )}

        {/* 空狀態 */}
        {!game.publicInfo && (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="space-y-4">
                <div className="text-6xl">🌍</div>
                <div>
                  <h3 className="text-xl font-semibold">尚未設定世界觀資訊</h3>
                  <p className="text-muted-foreground mt-2">
                    GM 尚未為此劇本設定世界觀資訊
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

