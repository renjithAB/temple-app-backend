import { env } from '../../config/env.js';
import { IPushService } from './push.interface.js';
import { MockPushService } from './mock.push.js';
import { FcmPushService } from './fcm.push.js';

let pushInstance: IPushService;

if (env.FCM_SERVICE_ACCOUNT_JSON) {
  pushInstance = new FcmPushService();
} else {
  pushInstance = new MockPushService();
}

export const pushService = pushInstance;
export * from './push.interface.js';
