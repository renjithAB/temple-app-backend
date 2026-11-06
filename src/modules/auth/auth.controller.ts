import { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { env } from '../../config/env.js';

export class AuthController {
  static async register(req: Request, res: Response) {
    const result = await AuthService.register(req.body);
    res.status(201).json({ data: result });
  }

  static async verifyEmail(req: Request, res: Response) {
    const userAgent = req.headers['user-agent'];
    const result = await AuthService.verifyEmail(
      req.body.email,
      req.body.code,
      userAgent
    );

    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    });

    res.status(200).json({ data: result });
  }

  static async login(req: Request, res: Response) {
    const userAgent = req.headers['user-agent'];
    const result = await AuthService.login(
      req.body.email,
      req.body.password,
      userAgent
    );

    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    });

    res.status(200).json({ data: result });
  }

  static async resendVerification(req: Request, res: Response) {
    const result = await AuthService.resendVerification(req.body.email);
    res.status(200).json({ data: result });
  }

  static async forgotPasswordRequest(req: Request, res: Response) {
    const result = await AuthService.forgotPasswordRequest(req.body.email);
    res.status(200).json({ data: result });
  }

  static async forgotPasswordReset(req: Request, res: Response) {
    const result = await AuthService.forgotPasswordReset(req.body);
    res.status(200).json({ data: result });
  }

  static async loginSuperAdmin(req: Request, res: Response) {
    return AuthController.login(req, res);
  }

  static async requestOtp(req: Request, res: Response) {
    const result = await AuthService.requestOtp(req.body.email);
    res.status(200).json({ data: result });
  }

  static async verifyOtp(req: Request, res: Response) {
    return AuthController.verifyEmail(req, res);
  }

  static async refresh(req: Request, res: Response) {
    const userAgent = req.headers['user-agent'];
    const token =
      req.body.refreshToken ||
      (req.headers.cookie &&
        req.headers.cookie
          .split(';')
          .find((c) => c.trim().startsWith('refreshToken='))
          ?.split('=')[1]);

    if (!token) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Refresh token is required',
          details: {},
        },
      });
    }

    const result = await AuthService.refresh(token, userAgent);

    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    });

    res.status(200).json({ data: result });
  }

  static async logout(req: Request, res: Response) {
    const token =
      req.body.refreshToken ||
      (req.headers.cookie &&
        req.headers.cookie
          .split(';')
          .find((c) => c.trim().startsWith('refreshToken='))
          ?.split('=')[1]);

    const result = await AuthService.logout(req.user!.id, token);

    res.clearCookie('refreshToken', { path: '/api/v1/auth' });
    res.status(200).json({ data: result });
  }
}
