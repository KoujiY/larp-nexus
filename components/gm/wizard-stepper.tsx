'use client';

/**
 * WizardStepper — 多步驟導航指示器
 *
 * 設計來源：Stitch Step 3（Done=深色+check, Active=primary+white ring, Upcoming=淡灰）
 * 可複用於任何需要多步驟流程的 Wizard。
 *
 * 若提供 onStepClick，每個步驟圓圈會變成可點擊按鈕，允許使用者自由跳步。
 */

import { Fragment } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

type WizardStepperProps = {
  /** 目前步驟（0-indexed） */
  currentStep: number;
  /** 步驟標籤陣列 */
  stepLabels: string[];
  /** 點擊步驟時的 callback；未提供時圓圈為純顯示元件 */
  onStepClick?: (step: number) => void;
};

export function WizardStepper({ currentStep, stepLabels, onStepClick }: WizardStepperProps) {
  const totalSteps = stepLabels.length;
  const clickable = Boolean(onStepClick);

  const renderCircle = (i: number) => {
    const baseClass = 'w-8 h-8 rounded-full flex items-center justify-center shadow-sm transition-all';
    const interactiveClass = clickable
      ? 'cursor-pointer hover:scale-110 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/50'
      : '';

    let stateClass: string;
    let content: React.ReactNode;
    if (i < currentStep) {
      stateClass = 'bg-foreground text-background';
      content = <Check className="h-4 w-4" strokeWidth={3} />;
    } else if (i === currentStep) {
      stateClass = 'bg-primary text-primary-foreground shadow-md ring-2 ring-background text-xs font-bold';
      content = i + 1;
    } else {
      stateClass = 'bg-muted text-muted-foreground/50 text-xs font-bold';
      content = i + 1;
    }

    const className = cn(baseClass, stateClass, interactiveClass);

    if (clickable) {
      return (
        <button
          type="button"
          onClick={() => onStepClick?.(i)}
          aria-label={`跳至步驟 ${i + 1}：${stepLabels[i]}`}
          aria-current={i === currentStep ? 'step' : undefined}
          className={className}
        >
          {content}
        </button>
      );
    }

    return <div className={className}>{content}</div>;
  };

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
            {renderCircle(i)}
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
