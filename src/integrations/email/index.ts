import { env } from '../../config/env.js';
import { IEmailService, SendEmailOptions } from './email.interface.js';
import { ConsoleEmailService } from './console.email.js';
import { BrevoEmailService } from './brevo.email.js';

class DynamicEmailService implements IEmailService {
  private consoleService: ConsoleEmailService | null = null;
  private brevoService: BrevoEmailService | null = null;

  private getActiveService(): IEmailService {
    const hasBrevoKey = !!(process.env.BREVO_SMTP_KEY || env.BREVO_SMTP_KEY);
    if (env.EMAIL_PROVIDER === 'brevo' || hasBrevoKey) {
      if (!this.brevoService) {
        this.brevoService = new BrevoEmailService();
      }
      return this.brevoService;
    }

    if (!this.consoleService) {
      this.consoleService = new ConsoleEmailService();
    }
    return this.consoleService;
  }

  async sendEmail(options: SendEmailOptions): Promise<void> {
    return this.getActiveService().sendEmail(options);
  }

  async sendOtp(to: string, code: string, purpose?: string): Promise<void> {
    return this.getActiveService().sendOtp(to, code, purpose);
  }
}

export const emailService: IEmailService = new DynamicEmailService();
export * from './email.interface.js';
