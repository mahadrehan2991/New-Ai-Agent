import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSecret } from "@/lib/webhookAuth";

const ToolEventSchema = z.object({
  id: z.string().optional(),
  callId: z.string().min(1, "callId is required"),
  toolName: z.string().min(1, "toolName is required"),
  arguments: z.union([z.string(), z.record(z.string(), z.any())]),
  result: z.union([z.string(), z.record(z.string(), z.any())]),
  durationMs: z.number().int().nonnegative().default(0),
  success: z.boolean().default(true),
  timestamp: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  const authError = verifyWebhookSecret(req);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parse = ToolEventSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: "Validation failed", details: parse.error.format() }, { status: 422 });
  }

  const data = parse.data;

  const argsString = typeof data.arguments === "string" ? data.arguments : JSON.stringify(data.arguments);
  const resultString = typeof data.result === "string" ? data.result : JSON.stringify(data.result);

  try {
    // Ensure call exists idempotently
    await prisma.call.upsert({
      where: { id: data.callId },
      update: {},
      create: {
        id: data.callId,
        callerPhone: "Unknown",
        status: "completed",
        outcome: "no_booking",
      },
    });

    const event = await prisma.toolEvent.create({
      data: {
        id: data.id,
        callId: data.callId,
        toolName: data.toolName,
        arguments: argsString,
        result: resultString,
        durationMs: data.durationMs,
        success: data.success,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      eventId: event.id,
      callId: data.callId,
      message: "Tool event recorded successfully.",
    });
  } catch (err: any) {
    console.error("Error in /api/webhooks/tool-event:", err);
    return NextResponse.json({ error: "Internal server error", message: err.message }, { status: 500 });
  }
}
