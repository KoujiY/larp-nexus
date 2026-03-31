import { PlayerThemeWrapper } from '@/components/player/player-theme-wrapper';

export default function WorldInfoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PlayerThemeWrapper>{children}</PlayerThemeWrapper>;
}
