import { getPublicCharacter } from '@/app/actions/public';
import { CharacterCardView } from '@/components/player/character-card-view';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { XCircle } from 'lucide-react';

interface CharacterPageProps {
  params: Promise<{ characterId: string }>;
}

export default async function CharacterPage({
  params,
}: CharacterPageProps) {
  const { characterId } = await params;

  const result = await getPublicCharacter(characterId);

  // 角色不存在
  if (!result.success || !result.data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
            <XCircle className="h-16 w-16 text-destructive" />
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
    <div className="min-h-screen bg-background">
      <CharacterCardView character={character} />
    </div>
  );
}
