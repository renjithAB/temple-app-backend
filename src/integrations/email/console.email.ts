import { IEmailService, SendEmailOptions } from './email.interface.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';

export class ConsoleEmailService implements IEmailService {
  async sendEmail(options: SendEmailOptions): Promise<void> {
    if (env.NODE_ENV === 'production') {
      logger.error({ to: options.to, subject: options.subject }, 'ConsoleEmailService is disallowed in production environment.');
      throw new Error('ConsoleEmailService is strictly disallowed in production environment. Please configure Brevo API key.');
    }

    console.log('\n===============================================================');
    console.log(`📧 [CONSOLE EMAIL] To: ${options.to}`);
    console.log(`📋 Subject: ${options.subject}`);
    console.log(`📝 Body:\n${options.text || options.html}`);
    console.log('===============================================================\n');

    logger.info({ to: options.to, subject: options.subject }, `Console email sent to ${options.to}`);
  }

  async sendOtp(to: string, code: string, purpose: string = 'VERIFY'): Promise<void> {
    if (env.NODE_ENV === 'production') {
      logger.error({ to, purpose }, 'ConsoleEmailService is disallowed in production environment.');
      throw new Error('ConsoleEmailService is strictly disallowed in production environment. Please configure Brevo API key.');
    }

    const isForgot = purpose === 'FORGOT_PASSWORD';
    const title = isForgot ? '🔑 [PASSWORD RESET OTP]' : '🔑 [EMAIL VERIFICATION OTP]';

    console.log('\n===============================================================');
    console.log(`🔔 ${title}`);
    console.log(`📧 Devotee Email: ${to}`);
    console.log(`👉 VERIFICATION OTP CODE: >>> ${code} <<<`);
    console.log(`⏰ Valid for: 5 minutes`);
    console.log('===============================================================\n');

    logger.info({ to, purpose, code }, `${title} generated for ${to}: ${code}`);
  }
}
