'use client';

import Link from 'next/link';
import { Map, ArrowRight } from 'lucide-react';

interface WorldInfoLinkProps {
  gameId: string;
}

export function WorldInfoLink({ gameId }: WorldInfoLinkProps) {
  return (
    <section className="px-6 mt-8">
      <Link href={`/g/${gameId}`}>
        <div className="bg-gradient-to-r from-surface-raised to-surface-base p-6 rounded-lg border border-border/10 flex justify-between items-center group cursor-pointer hover:shadow-2xl hover:shadow-primary/5 transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Map className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-foreground tracking-tight">查看世界觀與地理誌</h3>
              <p className="text-xs text-muted-foreground mt-0.5">深入了解你所身處的劇本世界觀</p>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-primary group-hover:translate-x-2 transition-transform shrink-0" />
        </div>
      </Link>
    </section>
  );
}
