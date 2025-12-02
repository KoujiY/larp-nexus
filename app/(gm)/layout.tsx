import { Navigation } from '@/components/gm/navigation';

export default function GMLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left Sidebar - Menu */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 border-r bg-card shrink-0">
        <Navigation />
      </aside>

      {/* Right Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-background">
        {children}
      </main>
    </div>
  );
}

