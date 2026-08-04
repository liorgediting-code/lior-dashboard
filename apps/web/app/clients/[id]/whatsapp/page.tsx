import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ClientTabs } from "@/components/client-tabs";
import { createAutomation } from "@/lib/actions/whatsapp";
import type { Client, WhatsappAutomation } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

const EXAMPLE_STEPS = JSON.stringify(
  [
    { type: "message", text: "היי! תודה שהשארת פרטים 🙌 מתי נוח לך שנדבר?" },
    { type: "wait", wait_minutes: 1440 },
    { type: "message", text: "רק בודקים שלא פספסת אותנו — עדיין רלוונטי?" },
  ],
  null,
  2
);

async function createAutomationAction(clientId: string, formData: FormData) {
  "use server";
  const steps = JSON.parse(String(formData.get("steps") ?? "[]"));
  await createAutomation({
    client_id: clientId,
    trigger: String(formData.get("trigger") ?? "lead_created"),
    steps,
    green_api_instance_id: String(formData.get("green_api_instance_id") ?? "") || null,
  });
}

export default async function ClientWhatsappPage({ params }: { params: { id: string } }) {
  const supabase = supabaseAdmin();
  const [{ data: client }, { data: automations }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", params.id).single(),
    supabase.from("whatsapp_automations").select("*").eq("client_id", params.id),
  ]);
  if (!client) notFound();
  const c = client as Client;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{c.name}</h1>
      <ClientTabs clientId={c.id} active="whatsapp" />

      <div className="mb-6 space-y-3">
        {((automations ?? []) as WhatsappAutomation[]).map((auto) => (
          <div key={auto.id} className="card">
            <p className="mb-2 font-medium">טריגר: {auto.trigger}</p>
            <ol className="space-y-1 text-sm text-slate-600">
              {auto.steps.map((step, i) => (
                <li key={i}>
                  {i + 1}.{" "}
                  {step.type === "message" ? `הודעה: "${step.text}"` : `המתנה: ${step.wait_minutes} דקות`}
                </li>
              ))}
            </ol>
          </div>
        ))}
        {(automations ?? []).length === 0 && <p className="text-slate-500">אין עדיין אוטומציות.</p>}
      </div>

      <form action={createAutomationAction.bind(null, c.id)} className="card space-y-4">
        <h2 className="font-semibold">אוטומציה חדשה</h2>
        <div>
          <label className="label" htmlFor="trigger">
            טריגר
          </label>
          <select className="input" id="trigger" name="trigger" defaultValue="lead_created">
            <option value="lead_created">ליד נכנס</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="green_api_instance_id">
            Green API Instance ID
          </label>
          <input className="input" id="green_api_instance_id" name="green_api_instance_id" placeholder="ריק = מצב Mock מקומי" />
        </div>
        <div>
          <label className="label" htmlFor="steps">
            שלבים (JSON)
          </label>
          <textarea className="input font-mono" id="steps" name="steps" rows={8} defaultValue={EXAMPLE_STEPS} />
        </div>
        <button type="submit" className="btn btn-primary">
          + צור אוטומציה
        </button>
      </form>
    </div>
  );
}
