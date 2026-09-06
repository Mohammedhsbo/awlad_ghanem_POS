export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
export const REFRESH_TOKEN_COOKIE = "refreshToken";
export const PENDING_PROFILE_COOKIE = "pendingProfile";
import { isLocalDesktopMode } from "./env.js";

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }

  return secret ?? "development-only-change-me";
}

export function getCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production" && !isLocalDesktopMode(),
    maxAge: maxAgeSeconds * 1000,
    path: "/api/v1/auth",
  };
}

export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL;

  if (!isLocalDesktopMode() && process.env.NODE_ENV !== "development") {
    if (!clientId || !clientSecret || !callbackUrl) {
      throw new Error("Missing Google OAuth credentials in production/staging");
    }
    return { clientId, clientSecret, callbackUrl };
  }

  return {
    clientId: clientId || "development-client-id",
    clientSecret: clientSecret || "development-client-secret",
    callbackUrl: callbackUrl || "http://127.0.0.1:3000/api/v1/auth/google/callback",
  };
}
