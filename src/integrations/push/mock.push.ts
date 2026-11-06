import { IPushService, PushNotificationPayload } from './push.interface.js';
import { logger } from '../../lib/logger.js';

export class MockPushService implements IPushService {
  async sendToDevice(
    fcmToken: string,
    notification: PushNotificationPayload
  ): Promise<boolean> {
    logger.info(
      { token: fcmToken, title: notification.title },
      `📱 [MOCK PUSH] To Token: ${fcmToken.slice(0, 10)}... | Title: "${notification.title}" | Body: "${notification.body}"`
    );
    return true;
  }

  async sendToTopic(
    topic: string,
    notification: PushNotificationPayload
  ): Promise<boolean> {
    logger.info(
      { topic, title: notification.title },
      `📢 [MOCK TOPIC PUSH] To Topic: ${topic} | Title: "${notification.title}" | Body: "${notification.body}"`
    );
    return true;
  }
}
