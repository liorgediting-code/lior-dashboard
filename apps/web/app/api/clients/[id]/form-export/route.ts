import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assertAgencyAccess } from "@/lib/auth/assert-agency-access";
import { buildSubmissionMarkdown, submissionExportFilename } from "@/lib/forms/export-markdown";
import type { FormSubmission, FormTemplate } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

/**
 * Downloads one client's filled form as a Markdown document — the thing the
 * agency hands to whoever writes the strategy.
 *
 * A GET rather than a server action because the browser has to receive it as
 * a FILE: server actions can only return values into the React tree, and
 * Content-Disposition is the only way to make a download happen.
 *
 * The client is taken from the PATH and the template from the query, then the
 * submission is looked up by that pair — so a template id from another
 * client's form returns 404 instead of leaking their answers.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertAgencyAccess();
  } catch {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const templateId = req.nextUrl.searchParams.get("template");
  if (!templateId) return NextResponse.json({ error: "לא נבחר טופס" }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data: row } = await supabase
    .from("form_submissions")
    .select("*, form_templates(name, questions), clients(name)")
    .eq("client_id", params.id)
    .eq("template_id", templateId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "הטופס לא נמצא" }, { status: 404 });

  const submission = row as FormSubmission & {
    form_templates: Pick<FormTemplate, "name" | "questions"> | null;
    clients: { name: string } | null;
  };
  const template = submission.form_templates;
  if (!template) return NextResponse.json({ error: "הטופס לא נמצא" }, { status: 404 });

  const clientName = submission.clients?.name ?? "לקוח";
  const markdown = buildSubmissionMarkdown({
    clientName,
    templateName: template.name,
    submittedAt: submission.submitted_at,
    questions: template.questions,
    answers: submission.answers,
  });
  const filename = submissionExportFilename(template.name, clientName, submission.submitted_at);

  // filename* with UTF-8, not a bare filename=: every name here is Hebrew,
  // and a bare filename= is limited to ASCII (RFC 6266).
  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
