import "server-only";
import type { GreenApiClient } from "./types";

/**
 * Real Green API (WhatsApp) client. Correctly shaped against Green API's
 * REST contract, but unverifiable without a real instance/token — see
 * mock-client.ts for local/demo use (selected when GREEN_API_USE_MOCK=true).
 */
export class RealGreenApiClient implements GreenApiClient {
  constructor(private readonly token: string) {}

  async sendTextMessage(instanceId: string, phone: string, message: string) {
    const chatId = `${phone.replace(/[^0-9]/g, "")}@c.us`;
    const url = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${this.token}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chatId, message }),
    });
    if (!res.ok) return { sent: false };
    const data = (await res.json()) as { idMessage?: string };
    return { sent: true, idMessage: data.idMessage };
  }
}
