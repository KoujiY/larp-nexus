"use client"

import {
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * 全局通知元件
 *
 * 從頂部滑入，顯示系統/API 層級的錯誤與驗證訊息。
 * 搭配 lib/notify.ts 使用，所有元件不應直接呼叫 toast。
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      position="top-center"
      closeButton
      duration={5000}
      expand
      richColors
      visibleToasts={5}
      gap={8}
      className="toaster group"
      icons={{
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
