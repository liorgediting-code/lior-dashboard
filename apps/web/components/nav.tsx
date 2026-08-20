"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...props} />;
}

const links = [
  { href: "/", label: "דשבורד", icon: (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M3 12h6v9H3zM15 3h6v18h-6zM9 8h6v13H9z" /></Icon> },
  { href: "/clients", label: "לקוחות", icon: (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M17 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="10" cy="8" r="4" /><path d="M22 20v-2a4 4 0 0 0-3-3.87" /><path d="M16 4.13a4 4 0 0 1 0 7.75" /></Icon> },
  { href: "/campaigns", label: "קמפיינים", icon: (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z" /><path d="M16 9a4 4 0 0 1 0 6" /><path d="M19 6a8 8 0 0 1 0 12" /></Icon> },
  { href: "/agency-crm", label: "CRM סוכנות", icon: (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M3 3h18v18H3z" /><path d="M3 9h18M9 21V9" /></Icon> },
  { href: "/funnels", label: "פאנלים", icon: (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M22 3H2l8 9.46V19l4 2v-8.54z" /></Icon> },
  { href: "/notes", label: "יומן הערות", icon: (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></Icon> },
  { href: "/questionnaires", label: "שאלונים", icon: (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M9 12l2 2 4-4" /><path d="M5 3h14v18H5z" /></Icon> },
  { href: "/forms", label: "טפסים", icon: (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M8 13h8M8 17h5" /></Icon> },
  { href: "/instagram", label: "אינסטגרם", icon: (p: SVGProps<SVGSVGElement>) => <Icon {...p}><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5h.01" /></Icon> },
  { href: "/missions", label: "משימות", icon: (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></Icon> },
  { href: "/goals", label: "מטרות", icon: (p: SVGProps<SVGSVGElement>) => <Icon {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></Icon> },
  { href: "/kill-queue", label: "תור הריגה", icon: (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></Icon> },
  { href: "/settings", label: "הגדרות", icon: (p: SVGProps<SVGSVGElement>) => <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></Icon> },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 flex h-screen w-60 shrink-0 flex-col gap-6 overflow-y-auto bg-gradient-to-b from-blue-950 via-blue-900 to-blue-950 p-4 text-blue-100">
      <div className="flex items-center gap-2 px-2 pt-1">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-sm font-bold text-blue-200 ring-1 ring-inset ring-blue-400/30">
          L
        </span>
        <div>
          <div className="text-sm font-bold text-white">LiorEdits</div>
          <div className="flex items-center gap-1 text-[11px] text-blue-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-soft" />
            Live
          </div>
        </div>
      </div>

      <ul className="flex flex-col gap-0.5">
        {links.map((link) => {
          const active = link.href === "/" ? pathname === "/" : pathname?.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
                  active ? "bg-blue-500/20 text-white shadow-inner shadow-blue-400/10" : "text-blue-200/80 hover:bg-blue-800/50 hover:text-white"
                }`}
              >
                <link.icon className={`h-4 w-4 shrink-0 transition-transform duration-150 ${active ? "text-blue-300" : "text-blue-400/70 group-hover:scale-110"}`} />
                <span className="truncate">{link.label}</span>
                {active && <span className="ms-auto h-1.5 w-1.5 rounded-full bg-blue-300" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
