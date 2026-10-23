import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.WEBHOOK_SECRET || "whsec_harmony_secret_key_london";

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing Bearer authorization header" }, { status: 401 });
  }

  const providedToken = authHeader.replace("Bearer ", "").trim();

  // Timing safe comparison
  const expectedBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(providedToken);

  if (expectedBuffer.length !== providedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
    return NextResponse.json({ error: "Invalid webhook secret token" }, { status: 403 });
  }

  return NextResponse.json({
    status: "ok",
    message: "Webhook authenticated and successfully processed by Harmony ingestion pipeline.",
    timestamp: new Date().toISOString(),
  });
}
