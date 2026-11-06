export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface IEmailService {
  sendEmail(options: SendEmailOptions): Promise<void>;
  sendOtp(to: string, code: string, purpose?: 'VERIFY' | 'FORGOT_PASSWORD' | string): Promise<void>;
}
