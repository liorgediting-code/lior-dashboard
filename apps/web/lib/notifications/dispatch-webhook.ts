import "server-only";

/**
 * Fires an outbound webhook (e.g. the onboarding questionnaire) without
 * blocking the caller on a slow/unreachable endpoint. No QUESTIONNAIRE_WEBHOOK_URL
 * configured -> no-op, so client creation always succeeds locally.
 */
export async function dispatchWebhook(event: string, payload: Record<string, unknown>) {
  const url = process.env.QUESTIONNAIRE_WEBHOOK_URL;
  if (!url) {
    console.info(`[webhook:${event}] QUESTIONNAIRE_WEBHOOK_URL not set, skipping`, payload);
    return;
  }

  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, payload }),
    });
  } catch (err) {
    console.error(`[webhook:${event}] failed`, err);
  }
}
