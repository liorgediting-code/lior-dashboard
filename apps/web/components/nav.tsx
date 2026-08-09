import Link from "next/link";

const links = [
  { href: "/", label: "דשבורד" },
  { href: "/clients", label: "לקוחות" },
  { href: "/agency-crm", label: "CRM סוכנות" },
  { href: "/funnels", label: "פאנלים" },
  { href: "/notes", label: "יומן הערות" },
  { href: "/questionnaires", label: "שאלונים" },
  { href: "/missions", label: "משימות" },
  { href: "/goals", label: "מטרות" },
  { href: "/kill-queue", label: "תור הריגה" },
  { href: "/settings", label: "הגדרות" },
];

export function Nav() {
  return (
    <nav className="flex h-screen w-56 shrink-0 flex-col border-l border-slate-200 bg-white p-4">
      <div className="mb-6 text-lg font-bold">LiorEdits</div>
      <ul className="flex flex-col gap-1">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
