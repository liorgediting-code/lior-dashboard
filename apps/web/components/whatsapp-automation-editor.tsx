"use client";

import { useState } from "react";
import type { WhatsappAutomation } from "@dashboard-lior/shared";
import { StepsEditor } from "@/components/steps-editor";
import { updateAutomation } from "@/lib/actions/whatsapp";
import { stepToRow } from "@/lib/forms/steps";

const UNIT_LABELS: Record<"minutes" | "hours" | "days", string> = {
  minutes: "דקות",
  hours: "שעות",
  days: "ימים",
};

const TRIGGER_LABELS: Record<string, string> = {
  lead_created: "כשנכנס ליד חדש",
};

async function updateAutomationAction(id: string, clientId: string, formData: FormData) {
  const steps = JSON.parse(String(formData.get("steps") ?? "[]"));
  await updateAutomation(id, clientId, steps);
}

export function WhatsappAutomationEditor({ automation, clientId }: { automation: WhatsappAutomation; clientId: string }) {
  const [editing, setEditing] = useState(false);
  const action = updateAutomationAction.bind(null, automation.id, clientId);

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-medium">{TRIGGER_LABELS[automation.trigger] ?? `טריגר: ${automation.trigger}`}</p>
        <button type="button" className="btn btn-secondary text-sm" onClick={() => setEditing((v) => !v)}>
          {editing ? "בטל" : "ערוך הודעות/תזרים"}
        </button>
      </div>

      {!editing && (
        <ol className="space-y-1 text-sm text-slate-600">
          {automation.steps.map((step, i) => (
            <li key={i}>
              {i + 1}.{" "}
              {step.type === "message"
                ? `הודעה: "${step.text}"`
                : (() => {
                    const row = stepToRow(step);
                    return row.type === "wait" ? `המתנה: ${row.amount} ${UNIT_LABELS[row.unit]}` : "";
                  })()}
            </li>
          ))}
          {automation.steps.length === 0 && <li className="text-slate-400">אין שלבים מוגדרים.</li>}
        </ol>
      )}

      {editing && (
        <form
          action={async (formData) => {
            await action(formData);
            setEditing(false);
          }}
          className="space-y-3"
        >
          <StepsEditor name="steps" defaultValue={automation.steps} />
          <button type="submit" className="btn btn-primary text-sm">
            שמור שינויים
          </button>
        </form>
      )}
    </div>
  );
}
