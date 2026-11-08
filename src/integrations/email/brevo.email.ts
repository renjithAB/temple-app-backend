import { IEmailService, SendEmailOptions } from './email.interface.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

export class BrevoEmailService implements IEmailService {
  async sendEmail(options: SendEmailOptions): Promise<void> {
    const apiKey = process.env.BREVO_SMTP_KEY || env.BREVO_SMTP_KEY;
    const senderEmail = env.EMAIL_FROM || 'noreply@templeplatform.org';

    if (!apiKey) {
      logger.warn('Brevo API key is not configured, skipping email delivery');
      return;
    }

    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          sender: { email: senderEmail, name: 'Temple Platform' },
          to: [{ email: options.to }],
          subject: options.subject,
          htmlContent: options.html || options.text,
          textContent: options.text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ status: response.status, errorText, to: options.to }, 'Failed to send email via Brevo REST API');
        throw new Error(`Brevo email delivery failed: ${response.statusText}`);
      }

      logger.info({ to: options.to, subject: options.subject }, 'Email sent successfully via Brevo REST API');
    } catch (error) {
      logger.error({ error, to: options.to }, 'Failed to send email via Brevo');
      throw error;
    }
  }

  async sendOtp(to: string, code: string, purpose: string = 'VERIFY'): Promise<void> {
    const isForgot = purpose === 'FORGOT_PASSWORD';
    const subject = isForgot
      ? 'Reset Your Temple Platform Password'
      : 'Verify Your Temple Platform Email';
    const actionDesc = isForgot
      ? 'Use the verification code below to reset your password:'
      : 'Use the verification code below to verify your email and activate your account:';
    const text = `${actionDesc} ${code}. It expires in 5 minutes. If you did not request this, please ignore this email.`;
    const html = `
      <div style="font-family: sans-serif; max-width: 500px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #1e293b;">${subject}</h2>
        <p style="color: #475569; font-size: 16px;">${actionDesc}</p>
        <div style="background-color: #f1f5f9; padding: 16px; font-size: 32px; font-weight: bold; text-align: center; letter-spacing: 6px; color: #0f172a; border-radius: 6px; margin: 24px 0;">
          ${code}
        </div>
        <p style="color: #64748b; font-size: 14px;">This code will expire in 5 minutes. Never share this code with anyone.</p>
      </div>
    `;

    await this.sendEmail({ to, subject, text, html });
  }
}
