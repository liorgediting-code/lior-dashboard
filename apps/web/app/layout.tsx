import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "LiorEdits — דשבורד ניהול לקוחות",
  description: "דשבורד פנימי לניהול לקוחות הסוכנות",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <div className="flex">
          <Nav />
          <main className="min-h-screen flex-1 p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
