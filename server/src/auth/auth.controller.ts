import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards, UsePipes } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { Request, Response } from "express";
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  type ChangePasswordRequest,
  type LoginRequest,
  type RegisterRequest,
} from "@motorcycle-system/shared-types";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import type { AuthenticatedRequest } from "../common/types/authenticated-request.js";
import { getCookieOptions, REFRESH_TOKEN_COOKIE, REFRESH_TOKEN_TTL_SECONDS, PENDING_PROFILE_COOKIE } from "../config/auth.config.js";
import { generatePendingProfileToken, verifyToken } from "../utils/jwt.js";
import { z } from "zod";

const completeProfileSchema = z.object({
  phone: z.string().min(1, "Phone is required"),
});
import { JwtAuthGuard } from "./guards/jwt-auth.guard.js";
import { AuthService } from "./auth.service.js";
import { AppError } from "../common/errors/app-error.js";


import { Inject } from "@nestjs/common";

@Controller("auth")
export class AuthController {
  private readonly authService: AuthService;

  constructor(@Inject(AuthService) authService: AuthService) {
    this.authService = authService;
  }
  @Post("register")
  @UsePipes(new ZodValidationPipe(registerRequestSchema))
  async register(@Body() body: RegisterRequest) {
    return {
      success: true,
      data: await this.authService.registerCustomer(body),
    };
  }

  @Post("admin-login")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: Number(process.env.LOGIN_RATE_LIMIT_TTL_MS ?? 60_000), limit: Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 5) } })
  @UsePipes(new ZodValidationPipe(loginRequestSchema))
  async adminLogin(@Body() body: LoginRequest, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    if (body.email.toLowerCase() !== "admin@manage.com") {
      throw new AppError("INVALID_CREDENTIALS", 401, "Invalid credentials");
    }

    const result = await this.authService.login(body, this.getIp(request));
    response.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, getCookieOptions(REFRESH_TOKEN_TTL_SECONDS));

    return {
      success: true,
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
    };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: Number(process.env.LOGIN_RATE_LIMIT_TTL_MS ?? 60_000), limit: Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 5) } })
  @UsePipes(new ZodValidationPipe(loginRequestSchema))
  async login(@Body() body: LoginRequest, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(body, this.getIp(request));
    response.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, getCookieOptions(REFRESH_TOKEN_TTL_SECONDS));

    return {
      success: true,
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
    };
  }

  @Get("google")
  googleAuth(@Res() response: Response) {
    response.redirect(this.authService.getGoogleAuthUrl());
  }

  @Get("google/callback")
  async googleCallback(@Req() request: Request, @Res() response: Response) {
    const code = request.query.code as string;
    if (!code) {
      return response.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?error=oauth_failed`);
    }

    try {
      const result = await this.authService.handleGoogleCallback(code, this.getIp(request));

      if (result.status === "needs_phone") {
        const token = generatePendingProfileToken(
          result.pendingGoogleProfile.googleId,
          result.pendingGoogleProfile.email,
          result.pendingGoogleProfile.name
        );
        response.cookie(PENDING_PROFILE_COOKIE, token.token, getCookieOptions(token.expiresInSeconds));
        return response.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/auth/complete-profile`);
      }

      response.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, getCookieOptions(REFRESH_TOKEN_TTL_SECONDS));
      return response.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/account/profile`);
    } catch (error) {
      console.error("Google OAuth error:", error);
      return response.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?error=oauth_failed`);
    }
  }

  @Post("google/complete-profile")
  @UsePipes(new ZodValidationPipe(completeProfileSchema))
  @HttpCode(HttpStatus.OK)
  async completeGoogleProfile(@Body() body: { phone: string }, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const pendingToken = request.cookies?.[PENDING_PROFILE_COOKIE] as string | undefined;
    if (!pendingToken) {
      throw new AppError("OAUTH_ERROR", 400, "Missing or expired pending profile token");
    }

    let payload;
    try {
      payload = verifyToken(pendingToken, "pending_profile");
    } catch {
      throw new AppError("OAUTH_ERROR", 400, "Invalid or expired pending profile token");
    }

    if (!payload.googleProfile) {
      throw new AppError("OAUTH_ERROR", 400, "Invalid pending profile payload");
    }

    const result = await this.authService.completeGoogleProfile(
      payload.sub,
      payload.googleProfile.email,
      payload.googleProfile.name,
      body.phone,
      this.getIp(request)
    );

    response.clearCookie(PENDING_PROFILE_COOKIE, getCookieOptions(0));
    response.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, getCookieOptions(REFRESH_TOKEN_TTL_SECONDS));

    return {
      success: true,
      data: null
    };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
    const result = await this.authService.refresh(refreshToken, this.getIp(request));
    response.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, getCookieOptions(REFRESH_TOKEN_TTL_SECONDS));

    return {
      success: true,
      data: {
        accessToken: result.accessToken,
      },
    };
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
    await this.authService.logout(request.user.id, refreshToken);
    response.clearCookie(REFRESH_TOKEN_COOKIE, getCookieOptions(0));

    return {
      success: true,
      data: null,
    };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@Req() request: AuthenticatedRequest) {
    return {
      success: true,
      data: await this.authService.getCurrentUser(
        request.user.id,
        request.user.isCustomer ? "customer" : "user",
      ),
    };
  }

  @Post("change-password")
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ZodValidationPipe(changePasswordRequestSchema))
  async changePassword(@Body() body: ChangePasswordRequest, @Req() request: AuthenticatedRequest) {
    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
    await this.authService.changePassword(request.user.id, body, refreshToken);

    return {
      success: true,
      data: null,
    };
  }

  private getIp(request: Request) {
    return request.ip ?? request.socket.remoteAddress ?? "unknown";
  }
}
