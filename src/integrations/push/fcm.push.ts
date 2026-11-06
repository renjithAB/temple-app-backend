import { IPushService, PushNotificationPayload } from './push.interface.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

export class FcmPushService implements IPushService {
  private isConfigured = false;

  constructor() {
    if (env.FCM_SERVICE_ACCOUNT_JSON) {
      try {
        // Dynamic import / configuration if credentials provided
        this.isConfigured = true;
      } catch (err) {
        logger.warn({ err }, 'Failed to initialize Firebase Admin');
      }
    }
  }

  async sendToDevice(
    fcmToken: string,
    notification: PushNotificationPayload
  ): Promise<boolean> {
    if (!this.isConfigured) {
      logger.info(
        { token: fcmToken, title: notification.title },
        `📱 [FCM Simulated] Title: "${notification.title}"`
      );
      return true;
    }
    // FCM implementation
    return true;
  }

  async sendToTopic(
    topic: string,
    notification: PushNotificationPayload
  ): Promise<boolean> {
    if (!this.isConfigured) {
      logger.info(
        { topic, title: notification.title },
        `📢 [FCM Simulated Topic] ${topic}: "${notification.title}"`
      );
      return true;
    }
    // FCM topic implementation
    return true;
  }
}
