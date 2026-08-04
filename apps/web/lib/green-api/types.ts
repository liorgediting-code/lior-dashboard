export interface GreenApiClient {
  sendTextMessage(instanceId: string, phone: string, message: string): Promise<{ sent: boolean; idMessage?: string }>;
}
