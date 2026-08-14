import Link from "next/link";

export function ClientTabs({ clientId, active }: { clientId: string; active: string }) {
  const tabs = [
    { key: "profile", label: "פרופיל", href: `/clients/${clientId}` },
    { key: "missions", label: "משימות", href: `/clients/${clientId}/missions` },
    { key: "campaigns", label: "קמפיינים", href: `/clients/${clientId}/campaigns` },
    { key: "funnels", label: "פאנלים", href: `/clients/${clientId}/funnels` },
    { key: "analyzer", label: "מנתח מודעות", href: `/clients/${clientId}/analyzer` },
    { key: "crm", label: "CRM", href: `/clients/${clientId}/crm` },
    { key: "whatsapp", label: "WhatsApp", href: `/clients/${clientId}/whatsapp` },
    { key: "videos", label: "וידאו", href: `/clients/${clientId}/videos` },
    { key: "reports", label: "דוח שבועי", href: `/clients/${clientId}/reports` },
  ];

  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
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
