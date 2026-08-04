import "server-only";
import type { GreenApiClient } from "./types";

export class MockGreenApiClient implements GreenApiClient {
  async sendTextMessage(instanceId: string, phone: string, message: string) {
    console.info(`[green-api:mock] instance=${instanceId} to=${phone}: ${message}`);
    return { sent: true, idMessage: `mock-${Date.now()}` };
  }
}
