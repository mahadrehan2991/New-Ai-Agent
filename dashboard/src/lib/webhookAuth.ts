import { NextResponse } from "next/server";
import crypto from "crypto";

export function verifyWebhookSecret(req: Request): NextResponse | null {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.WEBHOOK_SECRET || "whsec_harmony_secret_key_london";

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Unauthorized: Missing or malformed Bearer authorization header." },
      { status: 401 }
    );
  }

  const providedToken = authHeader.replace("Bearer ", "").trim();
  const expectedBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(providedToken);

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return NextResponse.json(
      { error: "Forbidden: Invalid webhook secret token." },
      { status: 403 }
    );
  }

  return null; // Auth succeeded
}
