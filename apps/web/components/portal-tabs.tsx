import Link from "next/link";

export function PortalTabs({
  clientId,
  active,
  notificationsCount = 0,
  showAutomations,
  questionnairePending = false,
  showReports = false,
  showVideos = false,
}: {
  clientId: string;
  active: "crm" | "notifications" | "questionnaire" | "automations" | "reports" | "videos";
  notificationsCount?: number;
  showAutomations: boolean;
  /** Marks the questionnaire tab until this week's answers are in. */
  questionnairePending?: boolean;
  showReports?: boolean;
  /** Hidden until the client actually has a video to review. */
  showVideos?: boolean;
}) {
  const tabs = [
    { key: "crm" as const, label: "CRM", href: `/client/${clientId}/crm` },
    {
      key: "notifications" as const,
      label: notificationsCount > 0 ? `תזכורות (${notificationsCount})` : "תזכורות",
      href: `/client/${clientId}/notifications`,
    },
    {
      key: "questionnaire" as const,
      label: questionnairePending ? "שאלון שבועי •" : "שאלון שבועי",
      href: `/client/${clientId}/questionnaire`,
    },
    ...(showVideos ? [{ key: "videos" as const, label: "וידאו", href: `/client/${clientId}/videos` }] : []),
    ...(showReports ? [{ key: "reports" as const, label: "דוחות", href: `/client/${clientId}/reports` }] : []),
    ...(showAutomations ? [{ key: "automations" as const, label: "אוטומציות WhatsApp", href: `/client/${clientId}/automations` }] : []),
  ];

  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-blue-100">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            active === tab.key ? "border-blue-600 text-blue-900" : "border-transparent text-slate-500 hover:text-blue-700"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
