import Link from "next/link";

export function MissionsTabs({ active }: { active: "clients" | "business" | "daily" }) {
  const tabs = [
    { key: "clients", label: "לקוחות", href: "/missions" },
    { key: "business", label: "משימות לעסק", href: "/missions/business" },
    { key: "daily", label: "יומי", href: "/missions/daily" },
  ] as const;

  return (
    <div className="mb-6 flex gap-1 border-b border-slate-200">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
            active === tab.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
