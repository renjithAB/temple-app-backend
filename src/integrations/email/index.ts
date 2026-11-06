import { env } from '../../config/env.js';
import { IEmailService } from './email.interface.js';
import { ConsoleEmailService } from './console.email.js';
import { BrevoEmailService } from './brevo.email.js';

let emailServiceInstance: IEmailService;

if (env.EMAIL_PROVIDER === 'brevo' && env.BREVO_SMTP_USER && env.BREVO_SMTP_KEY) {
  emailServiceInstance = new BrevoEmailService();
} else {
  emailServiceInstance = new ConsoleEmailService();
}

export const emailService = emailServiceInstance;
export * from './email.interface.js';
