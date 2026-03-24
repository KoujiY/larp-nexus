import { PlayerThemeWrapper } from '@/components/player/player-theme-wrapper';

export default function PlayerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PlayerThemeWrapper>{children}</PlayerThemeWrapper>;
}
