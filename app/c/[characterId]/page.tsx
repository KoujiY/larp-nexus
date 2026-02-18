import { getPublicCharacter } from '@/app/actions/public';
import { CharacterCardView } from '@/components/player/character-card-view';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Eye, Lock } from 'lucide-react';
import Link from 'next/link';

interface CharacterPageProps {
  params: Promise<{ characterId: string }>;
  searchParams: Promise<{ readonly?: string }>;
}

export default async function CharacterPage({
  params,
  searchParams,
}: CharacterPageProps) {
  const { characterId } = await params;
  const { readonly } = await searchParams;

  // 判斷是否為預覽模式
  const isReadOnly = readonly === 'true';

  const result = await getPublicCharacter(characterId);

  // 角色不存在
  if (!result.success || !result.data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="text-6xl">❌</div>
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold">找不到角色</h1>
              <p className="text-muted-foreground">
                {result.message || '此角色不存在或已被刪除'}
              </p>
            </div>
            <Link href="/">
              <Button variant="outline">返回首頁</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const character = result.data;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900">
      <div className="container max-w-4xl mx-auto p-4 md:p-8">
        {/* Phase 10.5.3: 預覽模式提示 */}
        {isReadOnly && (
          <Alert className="mb-6 border-amber-500 bg-amber-50">
            <Eye className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-900">預覽模式</AlertTitle>
            <AlertDescription className="text-amber-800">
              <p className="mb-2">
                您正在以預覽模式查看此角色。在此模式下，所有互動功能（使用道具、技能、對抗檢定）均已禁用。
              </p>
              <p className="flex items-center gap-1">
                <Lock className="h-3 w-3" />
                若要進入遊戲並使用完整功能，請前往{' '}
                <Link href="/unlock" className="underline font-medium">
                  解鎖頁面
                </Link>{' '}
                輸入遊戲代碼和 PIN。
              </p>
            </AlertDescription>
          </Alert>
        )}

        <CharacterCardView character={character} isReadOnly={isReadOnly} />
      </div>
    </div>
  );
}

