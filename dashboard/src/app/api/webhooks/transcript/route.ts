import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSecret } from "@/lib/webhookAuth";

const TurnItemSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["agent", "caller"]),
  text: z.string().min(1, "Turn text cannot be empty"),
  timestamp: z.string().datetime().optional(),
});

const TranscriptSchema = z.object({
  callId: z.string().min(1, "callId is required"),
  // Supports either a single turn or a batch of turns
  role: z.enum(["agent", "caller"]).optional(),
  text: z.string().optional(),
  turns: z.array(TurnItemSchema).optional(),
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

  const parse = TranscriptSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: "Validation failed", details: parse.error.format() }, { status: 422 });
  }

  const { callId, role, text, turns } = parse.data;

  // Build items list
  const turnsToInsert: { role: "agent" | "caller"; text: string; timestamp: Date }[] = [];

  if (turns && turns.length > 0) {
    for (const t of turns) {
      turnsToInsert.push({
        role: t.role,
        text: t.text,
        timestamp: t.timestamp ? new Date(t.timestamp) : new Date(),
      });
    }
  } else if (role && text) {
    turnsToInsert.push({
      role,
      text,
      timestamp: new Date(),
    });
  } else {
    return NextResponse.json(
      { error: "Must provide either 'role' & 'text' or a 'turns' array." },
      { status: 400 }
    );
  }

  try {
    // Verify call exists (or create if late start)
    await prisma.call.upsert({
      where: { id: callId },
      update: {},
      create: {
        id: callId,
        callerPhone: "Unknown",
        status: "completed",
        outcome: "no_booking",
      },
    });

    // Insert turns
    const createdTurns = await prisma.$transaction(
      turnsToInsert.map((t) =>
        prisma.transcriptTurn.create({
          data: {
            callId,
            role: t.role,
            text: t.text,
            timestamp: t.timestamp,
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      callId,
      insertedCount: createdTurns.length,
      message: "Transcript turns appended successfully.",
    });
  } catch (err: any) {
    console.error("Error in /api/webhooks/transcript:", err);
    return NextResponse.json({ error: "Internal server error", message: err.message }, { status: 500 });
  }
}
