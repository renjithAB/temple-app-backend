import nodemailer from 'nodemailer';
import { IEmailService, SendEmailOptions } from './email.interface.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

export class BrevoEmailService implements IEmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.BREVO_SMTP_HOST,
      port: env.BREVO_SMTP_PORT,
      secure: env.BREVO_SMTP_PORT === 465,
      auth: {
        user: env.BREVO_SMTP_USER,
        pass: env.BREVO_SMTP_KEY,
      },
    });
  }

  async sendEmail(options: SendEmailOptions): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: env.EMAIL_FROM,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      logger.info({ to: options.to, subject: options.subject }, 'Email sent successfully via Brevo');
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
