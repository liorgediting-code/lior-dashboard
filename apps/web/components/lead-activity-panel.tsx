"use client";

import { useRef, useState } from "react";
import type { LeadActivity, LeadActivityKind } from "@dashboard-lior/shared";
import { createLeadActivityFromForm } from "@/lib/actions/lead-activities";

const KIND_LABELS: Record<LeadActivityKind, string> = {
  call: "📞 שיחה",
  whatsapp: "💬 WhatsApp",
  note: "📝 הערה",
};

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
}

export function LeadActivityPanel({ leadId, clientId, activities }: { leadId: string; clientId: string; activities: LeadActivity[] }) {
  const [kind, setKind] = useState<LeadActivityKind>("note");
  const formRef = useRef<HTMLFormElement>(null);
  const action = createLeadActivityFromForm.bind(null, leadId, clientId);

  return (
    <div className="space-y-3 rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-500">יומן פעילות</p>
      {activities.length === 0 && <p className="text-sm text-slate-400">אין עדיין פעילות רשומה לליד הזה.</p>}
      <ul className="space-y-2">
        {activities.map((a) => (
          <li key={a.id} className="text-sm">
            <span className="ml-2 font-medium">{KIND_LABELS[a.kind]}</span>
            <span className="text-slate-700">{a.note}</span>
            <span className="mr-2 text-xs text-slate-400">{formatTimestamp(a.created_at)}</span>
          </li>
        ))}
      </ul>
      <form
        ref={formRef}
        action={async (formData) => {
          await action(formData);
          setKind("note");
          formRef.current?.reset();
        }}
        className="flex flex-wrap items-start gap-2"
      >
        <select className="input w-32" name="kind" value={kind} onChange={(e) => setKind(e.target.value as LeadActivityKind)}>
          <option value="note">📝 הערה</option>
          <option value="call">📞 שיחה</option>
          <option value="whatsapp">💬 WhatsApp</option>
        </select>
        <textarea className="input flex-1" name="note" rows={1} placeholder="מה קרה?" required />
        <button type="submit" className="btn btn-secondary text-sm">
          + הוסף
        </button>
      </form>
    </div>
  );
}
