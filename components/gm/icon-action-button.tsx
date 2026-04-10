'use client';

import { forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type IconActionButtonVariant = 'default' | 'destructive';

interface IconActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  variant?: IconActionButtonVariant;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
  asChild?: boolean;
  children?: React.ReactNode;
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
};

const variantClasses: Record<IconActionButtonVariant, string> = {
  default: 'text-muted-foreground hover:text-primary',
  destructive: 'text-muted-foreground/50 hover:text-destructive',
};

/**
 * 帶 Tooltip 的 icon-only 按鈕
 * 用於標頭操作列、角色卡片操作列等場景
 */
export const IconActionButton = forwardRef<HTMLButtonElement, IconActionButtonProps>(
  function IconActionButton(
    { icon, label, onClick, variant = 'default', size = 'md', disabled, className, asChild, children },
    ref,
  ) {
    const button = (
      <Button
        ref={ref}
        type="button"
        variant="ghost"
        size="icon"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'rounded-lg transition-colors cursor-pointer',
          sizeClasses[size],
          variantClasses[variant],
          className,
        )}
        asChild={asChild}
      >
        {asChild ? children : icon}
      </Button>
    );

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  },
);
