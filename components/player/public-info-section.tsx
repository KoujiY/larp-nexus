'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Users } from 'lucide-react';
import type { PublicInfo } from '@/types/character';

interface PublicInfoSectionProps {
  publicInfo?: PublicInfo;
}

export function PublicInfoSection({ publicInfo }: PublicInfoSectionProps) {
  if (!publicInfo) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* 角色背景 */}
      {publicInfo.background && publicInfo.background.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <BookOpen className="mr-2 h-5 w-5" />
              角色背景
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {publicInfo.background.map((block, index) =>
              block.type === 'title' ? (
                <h3 key={index} className="text-primary font-bold text-xl">
                  {block.content}
                </h3>
              ) : (
                <p key={index} className="whitespace-pre-wrap leading-relaxed">
                  {block.content}
                </p>
              )
            )}
          </CardContent>
        </Card>
      )}

      {/* 性格特徵 */}
      {publicInfo.personality && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <span className="mr-2">✨</span>
              性格特徵
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap leading-relaxed">
              {publicInfo.personality}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 人物關係 */}
      {publicInfo.relationships && publicInfo.relationships.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <Users className="mr-2 h-5 w-5" />
              人物關係
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {publicInfo.relationships.map((rel, index) => (
                <div
                  key={index}
                  className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <h4 className="font-semibold mb-2">{rel.targetName}</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {rel.description}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

