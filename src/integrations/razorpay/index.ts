import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../lib/errors.js';

export interface RazorpayOrderResult {
  orderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
  isMock: boolean;
}

export interface RazorpayVerifyInput {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface RazorpayRefundResult {
  refundId: string;
  amountPaise: number;
  status: string;
  isMock: boolean;
}

export class RazorpayService {
  private static get authHeader(): string {
    const key = env.RAZORPAY_KEY_ID;
    const secret = env.RAZORPAY_KEY_SECRET;
    return `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`;
  }

  private static isConfigured(): boolean {
    return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  }

  /**
   * Creates a payment order with Razorpay
   */
  static async createOrder(params: {
    amountPaise: number;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<RazorpayOrderResult> {
    if (!this.isConfigured()) {
      logger.warn('⚠️ Razorpay credentials not configured. Generating mock order for testing.');
      return {
        orderId: `order_mock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        amountPaise: params.amountPaise,
        currency: 'INR',
        keyId: 'rzp_test_mock_key',
        isMock: true,
      };
    }

    try {
      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.authHeader,
        },
        body: JSON.stringify({
          amount: params.amountPaise,
          currency: 'INR',
          receipt: params.receipt,
          notes: params.notes || {},
        }),
      });

      const data = await response.json() as any;

      if (!response.ok) {
        logger.error({ data }, 'Razorpay create order failed');
        throw AppError.badRequest(data?.error?.description || 'Failed to create payment gateway order');
      }

      return {
        orderId: data.id,
        amountPaise: data.amount,
        currency: data.currency,
        keyId: env.RAZORPAY_KEY_ID,
        isMock: false,
      };
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      logger.error({ err }, 'Error calling Razorpay createOrder API');
      throw AppError.internal('Payment gateway communication error');
    }
  }

  /**
   * Verifies the HMAC SHA-256 signature returned after user payment
   */
  static verifyPaymentSignature(input: RazorpayVerifyInput): boolean {
    if (!this.isConfigured()) {
      // Allow mock confirmation in test/dev environment if mock paymentId
      if (input.paymentId.startsWith('pay_mock_') || input.orderId.startsWith('order_mock_')) {
        return true;
      }
    }

    const secret = env.RAZORPAY_KEY_SECRET;
    if (!secret) return false;

    const payload = `${input.orderId}|${input.paymentId}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(input.signature, 'utf8')
    );
  }

  /**
   * Verifies a Razorpay Webhook signature
   */
  static verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const secret = env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      logger.warn('RAZORPAY_WEBHOOK_SECRET is not configured; webhook verification rejected.');
      return false;
    }

    try {
      const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      return crypto.timingSafeEqual(
        Buffer.from(expected, 'utf8'),
        Buffer.from(signature, 'utf8')
      );
    } catch {
      return false;
    }
  }

  /**
   * Initiates an online refund via Razorpay
   */
  static async refundPayment(params: {
    paymentId: string;
    amountPaise?: number;
    notes?: Record<string, string>;
  }): Promise<RazorpayRefundResult> {
    if (!this.isConfigured() || params.paymentId.startsWith('pay_mock_')) {
      logger.info('Simulating mock refund in non-configured/sandbox environment');
      return {
        refundId: `rfnd_mock_${Date.now()}`,
        amountPaise: params.amountPaise || 0,
        status: 'processed',
        isMock: true,
      };
    }

    try {
      const body: Record<string, any> = { notes: params.notes || {} };
      if (params.amountPaise) {
        body.amount = params.amountPaise;
      }

      const response = await fetch(`https://api.razorpay.com/v1/payments/${params.paymentId}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.authHeader,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json() as any;

      if (!response.ok) {
        logger.error({ data }, 'Razorpay refund failed');
        throw AppError.badRequest(data?.error?.description || 'Gateway refund processing failed');
      }

      return {
        refundId: data.id,
        amountPaise: data.amount,
        status: data.status,
        isMock: false,
      };
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      logger.error({ err }, 'Error initiating Razorpay refund');
      throw AppError.internal('Failed to initiate online refund with gateway');
    }
  }
}

