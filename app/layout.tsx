import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LARP Nexus",
  description: "LARP GM/玩家輔助系統",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
