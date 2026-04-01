import { ReactNode } from 'react';

interface PageLayoutProps {
  /** 全寬頂部插槽（例如環境橫幅），不受 maxWidth 限制 */
  topSlot?: ReactNode;
  header: ReactNode;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}

const maxWidthClasses = {
  sm: 'max-w-2xl',
  md: 'max-w-4xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
  '2xl': 'max-w-[1536px]',
  full: 'max-w-full',
};

export function PageLayout({
  topSlot,
  header,
  children,
  maxWidth = 'lg',
}: PageLayoutProps) {
  return (
    <div className="flex flex-col h-full">
      {/* 全寬頂部插槽（環境橫幅等） */}
      {topSlot}

      {/* Header Area */}
      <div className="border-b bg-card">
        <div className={`mx-auto px-6 py-8 min-h-[112px] flex items-center ${maxWidthClasses[maxWidth]}`}>
          <div className="w-full">
            {header}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto bg-background">
        <div className={`mx-auto px-6 py-6 ${maxWidthClasses[maxWidth]}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
