export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface IPushService {
  sendToDevice(
    fcmToken: string,
    notification: PushNotificationPayload
  ): Promise<boolean>;
  sendToTopic(
    topic: string,
    notification: PushNotificationPayload
  ): Promise<boolean>;
}
