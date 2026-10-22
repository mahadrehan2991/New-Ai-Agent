import { cookies } from "next/headers";
import crypto from "crypto";

const SESSION_COOKIE_NAME = "harmony_admin_session";
const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours

// Session secret derived from env
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  process.env.WEBHOOK_SECRET ||
  "harmony_clinic_secure_default_secret_key_2026";

// Rate limiting state for login: IP -> { attempts: number, lockUntil: number }
const loginRateLimitMap = new Map<string, { attempts: number; lockUntil: number }>();

export function checkLoginRateLimit(ip: string): { allowed: boolean; waitSeconds?: number } {
  const now = Date.now();
  const record = loginRateLimitMap.get(ip);
  if (!record) return { allowed: true };

  if (record.lockUntil > now) {
    const waitSeconds = Math.ceil((record.lockUntil - now) / 1000);
    return { allowed: false, waitSeconds };
  }

  if (record.attempts >= 5) {
    // 15-minute lockout after 5 consecutive failures
    record.lockUntil = now + 15 * 60 * 1000;
    loginRateLimitMap.set(ip, record);
    return { allowed: false, waitSeconds: 15 * 60 };
  }

  return { allowed: true };
}

export function recordLoginFailure(ip: string) {
  const now = Date.now();
  const record = loginRateLimitMap.get(ip) || { attempts: 0, lockUntil: 0 };
  record.attempts += 1;
  loginRateLimitMap.set(ip, record);
}

export function resetLoginRateLimit(ip: string) {
  loginRateLimitMap.delete(ip);
}

/**
 * Constant-time password verification against ADMIN_PASSWORD env
 */
export function verifyAdminPassword(input: string): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD || "admin_harmony_2026";
  const a = Buffer.from(input);
  const b = Buffer.from(adminPassword);

  if (a.length !== b.length) {
    // Constant time dummy comparison
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

/**
 * Creates an HMAC-signed session token
 */
export function generateSessionToken(): string {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const data = `admin:${timestamp}:${nonce}`;
  const hmac = crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("hex");
  return `${data}.${hmac}`;
}

/**
 * Validates the HMAC signature and expiration of a session token
 */
export function isValidSessionToken(token: string): boolean {
  if (!token || !token.includes(".")) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [data, signature] = parts;
  const expectedHmac = crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("hex");

  const a = Buffer.from(signature);
  const b = Buffer.from(expectedHmac);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  const [user, timestampStr] = data.split(":");
  if (user !== "admin") return false;

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  // Enforce 24-hour expiration
  const ageSeconds = (Date.now() - timestamp) / 1000;
  return ageSeconds <= SESSION_MAX_AGE;
}

export async function setAdminSessionCookie(): Promise<string> {
  const token = generateSessionToken();
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return token;
}

export async function clearAdminSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (!sessionCookie?.value) return false;
  return isValidSessionToken(sessionCookie.value);
}
