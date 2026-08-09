import Link from "next/link";

export function PortalTabs({
  clientId,
  active,
  notificationsCount = 0,
  showAutomations,
}: {
  clientId: string;
  active: "crm" | "notifications" | "questionnaire" | "automations";
  notificationsCount?: number;
  showAutomations: boolean;
}) {
  const tabs = [
    { key: "crm" as const, label: "CRM", href: `/client/${clientId}/crm` },
    {
      key: "notifications" as const,
      label: notificationsCount > 0 ? `תזכורות (${notificationsCount})` : "תזכורות",
      href: `/client/${clientId}/notifications`,
    },
    { key: "questionnaire" as const, label: "שאלון שבועי", href: `/client/${clientId}/questionnaire` },
    ...(showAutomations ? [{ key: "automations" as const, label: "אוטומציות WhatsApp", href: `/client/${clientId}/automations` }] : []),
  ];

  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-indigo-100">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
            active === tab.key ? "border-indigo-900 text-indigo-950" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
