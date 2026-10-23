import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSecret } from "@/lib/webhookAuth";

const CallStartedSchema = z.object({
  callId: z.string().min(1, "callId is required"),
  callerPhone: z.string().min(1, "callerPhone is required"),
  startedAt: z.string().datetime().optional(),
  patientFirstName: z.string().optional(),
  patientLastName: z.string().optional(),
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

  const parse = CallStartedSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: "Validation failed", details: parse.error.format() }, { status: 422 });
  }

  const { callId, callerPhone, startedAt, patientFirstName, patientLastName } = parse.data;

  try {
    // 1. Link or find existing patient by phone
    let patient = await prisma.patient.findUnique({
      where: { phone: callerPhone },
    });

    if (!patient && patientFirstName && patientLastName) {
      patient = await prisma.patient.create({
        data: {
          firstName: patientFirstName,
          lastName: patientLastName,
          phone: callerPhone,
          patientType: "new",
        },
      });
    }

    // 2. Idempotent call creation (upsert on callId)
    const call = await prisma.call.upsert({
      where: { id: callId },
      update: {
        callerPhone,
        patientId: patient?.id ?? undefined,
      },
      create: {
        id: callId,
        callerPhone,
        startedAt: startedAt ? new Date(startedAt) : new Date(),
        status: "completed",
        outcome: "no_booking",
        patientId: patient?.id ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      callId: call.id,
      patientId: call.patientId,
      message: "Call session initialized successfully.",
    });
  } catch (err: any) {
    console.error("Error in /api/webhooks/call-started:", err);
    return NextResponse.json({ error: "Internal server error", message: err.message }, { status: 500 });
  }
}
