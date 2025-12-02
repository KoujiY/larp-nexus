'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Package } from 'lucide-react';
import Image from 'next/image';
import type { Item } from '@/types/character';

interface ItemListProps {
  items?: Item[];
}

export function ItemList({ items }: ItemListProps) {
  if (!items || items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="space-y-4">
            <Package className="mx-auto h-12 w-12 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold">背包是空的</h3>
              <p className="text-sm text-muted-foreground mt-2">
                你還沒有獲得任何道具
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {items.map((item) => (
        <Card key={item.id} className="overflow-hidden hover:shadow-lg transition-shadow">
          <div className="aspect-square relative overflow-hidden bg-muted">
            {item.imageUrl ? (
              <Image
                src={item.imageUrl}
                alt={item.name}
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Package className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
          </div>
          <CardContent className="p-4">
            <h4 className="font-semibold mb-1 line-clamp-1">{item.name}</h4>
            {item.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {item.description}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

