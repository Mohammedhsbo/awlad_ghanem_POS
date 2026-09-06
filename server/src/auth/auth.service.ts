import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  AuthUser,
  ChangePasswordRequest,
  CurrentUserResponse,
  Language,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
} from "@motorcycle-system/shared-types";
import { PrismaService } from "../prisma/prisma.service.js";
import { TokenStoreService } from "../token-store/token-store.service.js";
import { AppError } from "../common/errors/app-error.js";
import { REFRESH_TOKEN_TTL_SECONDS, getGoogleOAuthConfig } from "../config/auth.config.js";
import { decodeToken, generateAccessToken, generateRefreshToken, verifyToken } from "../utils/jwt.js";
import type { TokenPrincipal } from "../utils/jwt.js";
import { hashPassword, verifyPassword } from "../utils/password.js";

const authUserInclude = {
  include: {
    branch: {
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
      },
    },
    role: {
      include: {
        permissions: true,
      },
    },
  },
} satisfies Prisma.UserDefaultArgs;

type AuthUserRecord = Prisma.UserGetPayload<typeof authUserInclude>;

type CustomerRecord = Prisma.CustomerGetPayload<{}>;

@Injectable()
export class AuthService {
  private readonly prisma: PrismaService;
  private readonly tokenStore: TokenStoreService;

  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(TokenStoreService) tokenStore: TokenStoreService,
  ) {
    this.prisma = prisma;
    this.tokenStore = tokenStore;
  }

  async registerCustomer(input: RegisterRequest): Promise<RegisterResponse> {
    const email = input.email.toLowerCase();

    const [emailExists, phoneExists] = await Promise.all([
      this.prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } }),
      this.prisma.user.findFirst({ where: { phone: input.phone } }),
    ]);

    if (emailExists) {
      throw new AppError("EMAIL_EXISTS", 409, "Email already exists");
    }
    if (phoneExists) {
      throw new AppError("PHONE_EXISTS", 409, "Phone already exists");
    }

    const customerRole = await this.prisma.role.findUnique({ where: { name: "customer" } });
    if (!customerRole) {
      throw new AppError("ROLE_NOT_FOUND", 500, "Customer role is not configured");
    }

    const user = await this.prisma.user.create({
      data: {
        name: input.name,
        phone: input.phone,
        email,
        passwordHash: await hashPassword(input.password),
        roleId: customerRole.id,
        lang: "ar",
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
      },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? input.phone,
    };
  }

  getGoogleAuthUrl(): string {
    const config = getGoogleOAuthConfig();
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.append("client_id", config.clientId);
    url.searchParams.append("redirect_uri", config.callbackUrl);
    url.searchParams.append("response_type", "code");
    url.searchParams.append("scope", "openid email profile");
    url.searchParams.append("access_type", "offline");
    url.searchParams.append("prompt", "consent");
    return url.toString();
  }

  async handleGoogleCallback(code: string, ip: string) {
    const config = getGoogleOAuthConfig();
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.callbackUrl,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenResponse.ok) {
      throw new AppError("OAUTH_ERROR", 400, "Failed to exchange authorization code");
    }

    const tokenData = (await tokenResponse.json()) as { id_token?: string };
    if (!tokenData.id_token) {
      throw new AppError("OAUTH_ERROR", 400, "No id_token in Google response");
    }

    const payloadBase64 = tokenData.id_token.split('.')[1];
    const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf8');
    const googleUser = JSON.parse(payloadJson) as { email?: string; sub?: string; name?: string };

    if (!googleUser.email || !googleUser.sub) {
      throw new AppError("OAUTH_ERROR", 400, "Google profile missing required fields");
    }

    let customer = await this.prisma.customer.findUnique({
      where: { googleId: googleUser.sub }
    });

    if (customer) {
      if (!customer.isActive) {
        throw new AppError("ACCOUNT_INACTIVE", 403, "User account is inactive");
      }
      return this.issueCustomerTokens(customer.id);
    }

    customer = await this.prisma.customer.findFirst({
      where: { email: { equals: googleUser.email, mode: "insensitive" } }
    });

    if (customer) {
      if (customer.googleId && customer.googleId !== googleUser.sub) {
        throw new AppError("GOOGLE_ACCOUNT_CONFLICT", 409, "This email is linked to a different Google account");
      }
      if (!customer.isActive) {
        throw new AppError("ACCOUNT_INACTIVE", 403, "User account is inactive");
      }

      await this.prisma.customer.update({
        where: { id: customer.id },
        data: {
          googleId: googleUser.sub,
          authProvider: "google"
        }
      });
      return this.issueCustomerTokens(customer.id);
    }

    return {
      status: "needs_phone" as const,
      pendingGoogleProfile: {
        googleId: googleUser.sub,
        email: googleUser.email,
        name: googleUser.name || googleUser.email.split('@')[0],
      }
    };
  }

  async completeGoogleProfile(googleId: string, email: string, name: string, phone: string, ip: string) {
    const phoneExists = await this.prisma.customer.findFirst({ where: { phone } });
    if (phoneExists) {
      throw new AppError("PHONE_EXISTS", 409, "Phone number already exists");
    }

    // Also need to check if user table has this phone? Actually customer register checks both, so let's check user too
    const userPhoneExists = await this.prisma.user.findFirst({ where: { phone } });
    if (userPhoneExists) {
      throw new AppError("PHONE_EXISTS", 409, "Phone number already exists");
    }

    const customer = await this.prisma.customer.create({
      data: {
        name,
        email,
        phone,
        googleId,
        authProvider: "google",
        isActive: true,
      }
    });

    return this.issueCustomerTokens(customer.id);
  }

  private async issueCustomerTokens(customerId: string) {
    const access = generateAccessToken(customerId, "customer");
    const refresh = generateRefreshToken(customerId, "customer");
    await this.tokenStore.saveRefreshToken(customerId, refresh.tokenId, refresh.token, refresh.expiresInSeconds);

    return {
      status: "authenticated" as const,
      accessToken: access.token,
      refreshToken: refresh.token,
    };
  }

  async login(input: LoginRequest, ip: string) {
    const email = input.email.toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      ...authUserInclude,
    });

    // Staff accounts live in the User table, e-commerce customers in Customer.
    // Both sign in here, so fall through to the customer table when no staff
    // account owns the address.
    if (!user) {
      return this.loginCustomer(email, input.password, ip);
    }

    const passwordMatches = await verifyPassword(input.password, user.passwordHash);
    if (!passwordMatches) {
      this.logAuthEvent(user, "auth.login.failure", ip).catch(console.error);
      throw new AppError("INVALID_CREDENTIALS", 401, "Invalid credentials");
    }

    if (!user.isActive) {
      this.logAuthEvent(user, "auth.login.inactive", ip).catch(console.error);
      throw new AppError("ACCOUNT_INACTIVE", 403, "User account is inactive");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const access = generateAccessToken(user.id);
    const refresh = generateRefreshToken(user.id);
    await this.tokenStore.saveRefreshToken(user.id, refresh.tokenId, refresh.token, refresh.expiresInSeconds);
    this.logAuthEvent(user, "auth.login.success", ip).catch(console.error);

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      user: this.toAuthUser(user),
    };
  }

  private async loginCustomer(email: string, password: string, ip: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });

    // A customer without a password hash was created at the counter and has
    // never registered online; it must not be distinguishable from a miss.
    if (!customer?.passwordHash) {
      this.logAuthEvent(null, "auth.login.failure", ip).catch(console.error);
      throw new AppError("INVALID_CREDENTIALS", 401, "Invalid credentials");
    }

    const passwordMatches = await verifyPassword(password, customer.passwordHash);
    if (!passwordMatches) {
      this.logAuthEvent(null, "auth.login.failure", ip).catch(console.error);
      throw new AppError("INVALID_CREDENTIALS", 401, "Invalid credentials");
    }

    if (!customer.isActive) {
      throw new AppError("ACCOUNT_INACTIVE", 403, "User account is inactive");
    }

    const access = generateAccessToken(customer.id, "customer");
    const refresh = generateRefreshToken(customer.id, "customer");
    await this.tokenStore.saveRefreshToken(customer.id, refresh.tokenId, refresh.token, refresh.expiresInSeconds);

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      user: await this.toCustomerAuthUser(customer),
    };
  }

  async refresh(refreshToken: string | undefined, ip: string) {
    if (!refreshToken) {
      throw new AppError("TOKEN_INVALID", 401, "Invalid or expired refresh token");
    }

    let payload;
    try {
      payload = verifyToken(refreshToken, "refresh");
    } catch {
      throw new AppError("TOKEN_INVALID", 401, "Invalid or expired refresh token");
    }

    if (await this.tokenStore.checkBlacklist(payload.jti)) {
      throw new AppError("TOKEN_INVALID", 401, "Invalid or expired refresh token");
    }

    const validStoredToken = await this.tokenStore.isRefreshTokenValid(payload.sub, payload.jti, refreshToken);
    if (!validStoredToken) {
      throw new AppError("TOKEN_INVALID", 401, "Invalid or expired refresh token");
    }

    if (payload.principal === "customer") {
      const customer = await this.prisma.customer.findUnique({ where: { id: payload.sub } });

      if (!customer) {
        throw new AppError("TOKEN_INVALID", 401, "Invalid or expired refresh token");
      }
      if (!customer.isActive) {
        throw new AppError("ACCOUNT_INACTIVE", 403, "User account is inactive");
      }

      return this.rotateRefreshToken(refreshToken, payload.jti, customer.id, "customer");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      ...authUserInclude,
    });

    if (!user) {
      throw new AppError("TOKEN_INVALID", 401, "Invalid or expired refresh token");
    }
    if (!user.isActive) {
      throw new AppError("ACCOUNT_INACTIVE", 403, "User account is inactive");
    }

    const rotated = await this.rotateRefreshToken(refreshToken, payload.jti, user.id, "user");
    this.logAuthEvent(user, "auth.token.refresh", ip).catch(console.error);

    return rotated;
  }

  private async rotateRefreshToken(
    currentToken: string,
    currentTokenId: string,
    subject: string,
    principal: TokenPrincipal,
  ) {
    await this.blacklistRefreshToken(currentToken, currentTokenId);
    await this.tokenStore.deleteRefreshToken(subject, currentTokenId);

    const access = generateAccessToken(subject, principal);
    const refresh = generateRefreshToken(subject, principal);
    await this.tokenStore.saveRefreshToken(subject, refresh.tokenId, refresh.token, refresh.expiresInSeconds);

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
    };
  }

  async logout(userId: string, refreshToken: string | undefined) {
    if (!refreshToken) {
      return;
    }

    try {
      const payload = verifyToken(refreshToken, "refresh");
      if (payload.sub === userId) {
        await this.blacklistRefreshToken(refreshToken, payload.jti);
        await this.tokenStore.deleteRefreshToken(userId, payload.jti);
      }
    } catch {
      return;
    }

    // AuditLog.userId is a foreign key into User, so customer sessions have
    // nothing to record here.
    const user = await this.prisma.user.findUnique({ where: { id: userId }, ...authUserInclude });
    if (user) {
      this.logAuthEvent(user, "auth.logout", "unknown").catch(console.error);
    }
  }

  async getCurrentUser(userId: string, principal: TokenPrincipal = "user"): Promise<CurrentUserResponse> {
    if (principal === "customer") {
      const customer = await this.prisma.customer.findUnique({ where: { id: userId } });

      if (!customer) {
        throw new AppError("TOKEN_INVALID", 401, "Invalid or expired token");
      }
      if (!customer.isActive) {
        throw new AppError("ACCOUNT_INACTIVE", 403, "User account is inactive");
      }

      return {
        ...(await this.toCustomerAuthUser(customer)),
        phone: customer.phone,
        branch: null,
        lastLoginAt: null,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      ...authUserInclude,
    });

    if (!user) {
      throw new AppError("TOKEN_INVALID", 401, "Invalid or expired token");
    }
    if (!user.isActive) {
      throw new AppError("ACCOUNT_INACTIVE", 403, "User account is inactive");
    }

    return {
      ...this.toAuthUser(user),
      phone: user.phone,
      branch: user.branch,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    };
  }

  async changePassword(userId: string, input: ChangePasswordRequest, currentRefreshToken?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError("TOKEN_INVALID", 401, "Invalid or expired token");
    }

    if (!user.passwordHash) {
      throw new AppError("OAUTH_ACCOUNT_NO_PASSWORD", 400, "This account uses Google sign-in. Set a password from account settings to enable password login.");
    }

    const passwordMatches = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!passwordMatches) {
      throw new AppError("INCORRECT_PASSWORD", 401, "Current password is incorrect");
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });

    let currentRefreshTokenId: string | undefined;
    if (currentRefreshToken) {
      try {
        const payload = verifyToken(currentRefreshToken, "refresh");
        if (payload.sub === userId) {
          currentRefreshTokenId = payload.jti;
        }
      } catch {
        currentRefreshTokenId = undefined;
      }
    }

    await this.tokenStore.deleteRefreshTokensForUser(userId, currentRefreshTokenId);
  }

  private async blacklistRefreshToken(token: string, tokenId: string) {
    const decoded = decodeToken(token);
    const ttlSeconds = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : REFRESH_TOKEN_TTL_SECONDS;
    await this.tokenStore.blacklistToken(tokenId, ttlSeconds);
  }

  private toAuthUser(user: AuthUserRecord): AuthUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: {
        id: user.role.id,
        name: user.role.name,
        permissions: user.role.permissions.map((permission) => ({
          resource: permission.resource as AuthUser["role"]["permissions"][number]["resource"],
          action: permission.action as AuthUser["role"]["permissions"][number]["action"],
        })),
      },
      branchId: user.branchId,
      lang: user.lang as Language,
    };
  }

  private async toCustomerAuthUser(customer: CustomerRecord): Promise<AuthUser> {
    // Customers carry the permissions of the shared "customer" role; the row is
    // seeded, but a database that predates it should still be able to sign in.
    const customerRole = await this.prisma.role.findUnique({
      where: { name: "customer" },
      include: { permissions: true },
    });

    return {
      id: customer.id,
      name: customer.name,
      email: customer.email ?? "",
      role: {
        id: customerRole?.id ?? customer.id,
        name: "customer",
        permissions: (customerRole?.permissions ?? []).map((permission) => ({
          resource: permission.resource as AuthUser["role"]["permissions"][number]["resource"],
          action: permission.action as AuthUser["role"]["permissions"][number]["action"],
        })),
      },
      branchId: null,
      lang: "ar" as Language,
    };
  }

  private async logAuthEvent(user: AuthUserRecord | null, action: string, ip: string) {
    if (!user) {
      console.warn(`Auth event ${action} from ${ip}`);
      return;
    }

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action,
        entityType: "auth",
        entityId: user.id,
        branchId: user.branchId,
        after: { ip },
      },
    });
  }
}
