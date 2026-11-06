import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env before validating
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  TRUST_PROXY_HOPS: z.coerce.number().default(1),
  RUN_JOBS: z
    .string()
    .transform((val) => val === 'true')
    .default('false'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  MIGRATION_DATABASE_URL: z.string().optional(),

  // JWT & Cryptography
  JWT_PRIVATE_KEY: z.string().default(''),
  JWT_PUBLIC_KEY: z.string().default(''),
  JWT_ISSUER: z.string().default('temple-platform'),
  JWT_AUDIENCE: z.string().default('temple-platform-clients'),
  OTP_HMAC_SECRET: z
    .string()
    .min(32, 'OTP_HMAC_SECRET must be at least 32 characters long')
    .default('dev-otp-hmac-secret-at-least-32-chars-long-for-security'),
  QR_SIGNING_SECRET: z
    .string()
    .min(32, 'QR_SIGNING_SECRET must be at least 32 characters long')
    .default('dev-qr-signing-secret-at-least-32-chars-long-for-security'),

  // Email
  EMAIL_PROVIDER: z.enum(['console', 'brevo']).default('console'),
  BREVO_SMTP_HOST: z.string().default('smtp-relay.brevo.com'),
  BREVO_SMTP_PORT: z.coerce.number().default(587),
  BREVO_SMTP_USER: z.string().optional().default(''),
  BREVO_SMTP_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('noreply@templeplatform.org'),

  // Cloudinary
  CLOUDINARY_URL: z.string().optional().default(''),

  // Firebase Cloud Messaging
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional().default(''),

  // Sentry
  SENTRY_DSN: z.string().optional().default(''),

  // CORS
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:5173,http://localhost:19006')
    .transform((val) => val.split(',').map((s) => s.trim())),
});

const parseEnv = () => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Invalid environment variables configuration:');
    console.error(JSON.stringify(parsed.error.format(), null, 2));
    process.exit(1);
  }

  // Section 8 rule: console email provider is refused in production
  if (parsed.data.NODE_ENV === 'production' && parsed.data.EMAIL_PROVIDER === 'console') {
    console.error('❌ Console email provider is strictly prohibited in production mode.');
    process.exit(1);
  }

  return parsed.data;
};

export const env = parseEnv();
export type Env = z.infer<typeof envSchema>;
