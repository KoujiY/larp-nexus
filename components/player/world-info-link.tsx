'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';

interface WorldInfoLinkProps {
  gameId: string;
}

export function WorldInfoLink({ gameId }: WorldInfoLinkProps) {
  return (
    <Card className="border-dashed border-primary/20 bg-primary/5">
      <CardContent className="py-6 text-center">
        <div className="space-y-2">
          <Globe className="h-10 w-10 text-primary mx-auto" />
          <h3 className="font-semibold">查看世界觀</h3>
          <p className="text-sm text-muted-foreground">
            了解劇本的世界觀、前導故事與章節資訊
          </p>
          <Link href={`/g/${gameId}`}>
            <Button variant="outline" className="mt-4">
              前往世界觀頁面 →
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

