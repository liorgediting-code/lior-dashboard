import "server-only";

/**
 * Real Telegram Bot API integration — correctly shaped, but unverifiable
 * without a real TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID. Falls back to a
 * console log locally so alerts-check can still be exercised end-to-end.
 */
export async function sendTelegramAlert(message: string): Promise<{ sent: boolean }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.info(`[telegram:mock] ${message}`);
    return { sent: false };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });

  return { sent: res.ok };
}
