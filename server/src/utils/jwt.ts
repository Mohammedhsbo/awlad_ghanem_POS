import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS, getJwtSecret } from "../config/auth.config.js";

export type TokenType = "access" | "refresh" | "pending_profile";

/**
 * Which table `sub` points at. Staff accounts live in `User`, e-commerce
 * customers in `Customer`; the two id spaces are disjoint, so the token has to
 * say which one it means. Tokens minted before this claim existed carry no
 * `principal` and are read as "user", which is what they were.
 */
export type TokenPrincipal = "user" | "customer";

export interface AuthTokenPayload {
  sub: string;
  jti: string;
  type: TokenType;
  principal: TokenPrincipal;
  googleProfile?: {
    email: string;
    name: string;
  };
}

export interface GeneratedToken {
  token: string;
  tokenId: string;
  expiresInSeconds: number;
}

function signToken(
  subject: string,
  type: TokenType,
  expiresInSeconds: number,
  principal: TokenPrincipal,
  extraPayload?: Record<string, unknown>
): GeneratedToken {
  const tokenId = randomUUID();
  const token = jwt.sign(
    {
      sub: subject,
      jti: tokenId,
      type,
      principal,
      ...extraPayload,
    },
    getJwtSecret(),
    { expiresIn: expiresInSeconds },
  );

  return { token, tokenId, expiresInSeconds };
}

export function generateAccessToken(subject: string, principal: TokenPrincipal = "user") {
  return signToken(subject, "access", ACCESS_TOKEN_TTL_SECONDS, principal);
}

export function generateRefreshToken(subject: string, principal: TokenPrincipal = "user") {
  return signToken(subject, "refresh", REFRESH_TOKEN_TTL_SECONDS, principal);
}

export function generatePendingProfileToken(googleId: string, email: string, name: string) {
  // Use a short 10-minute expiry
  return signToken(googleId, "pending_profile", 10 * 60, "customer", {
    googleProfile: { email, name }
  });
}

export function verifyToken(token: string, expectedType: TokenType): AuthTokenPayload {
  const decoded = jwt.verify(token, getJwtSecret()) as Partial<AuthTokenPayload>;

  if (!decoded.sub || !decoded.jti || decoded.type !== expectedType) {
    throw new Error("Invalid token payload");
  }

  if (decoded.principal !== undefined && decoded.principal !== "user" && decoded.principal !== "customer") {
    throw new Error("Invalid token payload");
  }

  return {
    sub: decoded.sub,
    jti: decoded.jti,
    type: decoded.type,
    principal: decoded.principal ?? "user",
    googleProfile: decoded.googleProfile,
  };
}

export function decodeToken(token: string) {
  return jwt.decode(token) as (AuthTokenPayload & { exp?: number }) | null;
}
