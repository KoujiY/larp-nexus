'use client';

/**
 * WizardStepper — 多步驟導航指示器
 *
 * 設計來源：Stitch Step 3（Done=深色+check, Active=primary+white ring, Upcoming=淡灰）
 * 可複用於任何需要多步驟流程的 Wizard。
 */

import { Fragment } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

type WizardStepperProps = {
  /** 目前步驟（0-indexed） */
  currentStep: number;
  /** 步驟標籤陣列 */
  stepLabels: string[];
};

export function WizardStepper({ currentStep, stepLabels }: WizardStepperProps) {
  const totalSteps = stepLabels.length;

  return (
    <div className="flex items-center gap-2">
      {/* Step circles + connectors */}
      <div className="flex items-center">
        {Array.from({ length: totalSteps }, (_, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <div
                className={cn(
                  'w-8 h-px',
                  i <= currentStep ? 'bg-foreground' : 'bg-border',
                )}
              />
            )}
            {i < currentStep ? (
              /* Done */
              <div className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center shadow-sm">
                <Check className="h-4 w-4" strokeWidth={3} />
              </div>
            ) : i === currentStep ? (
              /* Active */
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shadow-md ring-2 ring-background">
                {i + 1}
              </div>
            ) : (
              /* Upcoming */
              <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground/50 flex items-center justify-center text-xs font-bold">
                {i + 1}
              </div>
            )}
          </Fragment>
        ))}
      </div>

      {/* Current step info */}
      <div className="ml-4 flex flex-col items-end">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          步驟 {currentStep + 1} / {totalSteps}
        </span>
        <span className="font-extrabold text-foreground">
          {stepLabels[currentStep]}
        </span>
      </div>
    </div>
  );
}
