import { NextRequest, NextResponse } from "next/server";
import {
  checkLoginRateLimit,
  recordLoginFailure,
  resetLoginRateLimit,
  verifyAdminPassword,
  setAdminSessionCookie,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";
    const rateLimit = checkLoginRateLimit(ip);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Too many failed login attempts. Please wait ${rateLimit.waitSeconds} seconds before trying again.`,
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { password } = body;

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    const isValid = verifyAdminPassword(password);
    if (!isValid) {
      recordLoginFailure(ip);
      // Small artificial delay against brute force
      await new Promise((r) => setTimeout(r, 400));
      return NextResponse.json(
        { error: "Invalid password. Access denied." },
        { status: 401 }
      );
    }

    resetLoginRateLimit(ip);
    await setAdminSessionCookie();

    return NextResponse.json({ success: true, message: "Authenticated successfully" });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
