import { getPublicGame } from '@/app/actions/public';
import { notFound } from 'next/navigation';
import { WorldInfoView } from '@/components/player/world-info-view';

interface WorldInfoPageProps {
  params: Promise<{ gameId: string }>;
}

export default async function WorldInfoPage({ params }: WorldInfoPageProps) {
  const { gameId } = await params;
  const result = await getPublicGame(gameId);

  if (!result.success || !result.data) {
    notFound();
  }

  return <WorldInfoView game={result.data} />;
}
