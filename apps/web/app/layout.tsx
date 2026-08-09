import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LiorEdits — דשבורד ניהול לקוחות",
  description: "דשבורד פנימי לניהול לקוחות הסוכנות",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
