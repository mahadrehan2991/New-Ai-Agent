import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSecret } from "@/lib/webhookAuth";
import { enrichTranscript } from "@/lib/enrichment";

const CallEndedSchema = z.object({
  callId: z.string().min(1, "callId is required"),
  endedAt: z.string().datetime().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  callerPhone: z.string().optional(),
  patientName: z
    .union([
      z.string(),
      z.object({
        firstName: z.string(),
        lastName: z.string().optional(),
      }),
    ])
    .optional(),
  status: z.enum(["completed", "abandoned", "transferred", "failed"]).default("completed"),
  outcome: z.enum(["booked", "no_booking", "existing_lookup", "out_of_scope"]).optional(),
  summary: z.string().optional(),
  sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
  recordingUrl: z.string().optional(),
  // Extracted clinical fields if already computed by agent
  complaint: z
    .object({
      bodyArea: z.string(),
      description: z.string(),
      severity: z.number().int().min(1).max(5).optional(),
    })
    .optional(),
  // Booked appointment if call resulted in booking
  appointment: z
    .object({
      startsAt: z.string().datetime(),
      type: z.enum(["initial", "followup"]).default("initial"),
      insuranceDirectBilling: z.boolean().default(false),
      status: z.enum(["booked", "cancelled", "completed"]).default("booked"),
    })
    .optional(),
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

  const parse = CallEndedSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: "Validation failed", details: parse.error.format() }, { status: 422 });
  }

  const {
    callId,
    endedAt,
    durationSeconds,
    callerPhone: providedPhone,
    patientName: providedPatientName,
    status,
    outcome: providedOutcome,
    summary: providedSummary,
    sentiment: providedSentiment,
    recordingUrl,
    complaint: providedComplaint,
    appointment: providedAppointment,
  } = parse.data;

  try {
    // 1. Fetch current call and its transcript turns
    const existingCall = await prisma.call.findUnique({
      where: { id: callId },
      include: {
        transcriptTurns: { orderBy: { timestamp: "asc" } },
        patient: true,
        appointments: true,
      },
    });

    // If this is merely a late Twilio recording callback, simply save the recordingUrl without modifying patient or outcome
    if (recordingUrl && !providedAppointment && !providedPatientName && durationSeconds === undefined && existingCall) {
      const updated = await prisma.call.update({
        where: { id: callId },
        data: { recordingUrl },
      });
      return NextResponse.json({
        success: true,
        callId: updated.id,
        recordingUrl: updated.recordingUrl,
        message: "Recording URL attached to existing call.",
      });
    }

    const turns = existingCall?.transcriptTurns || [];

    // 2. Run LLM Enrichment step if summary, sentiment, complaint, or name not explicitly supplied
    let summary = providedSummary;
    let sentiment = providedSentiment;
    let complaintData = providedComplaint;
    let outcome = providedOutcome;
    let enrichmentName: { firstName: string; lastName: string } | undefined = undefined;

    if (!summary || !sentiment || !complaintData || !providedPatientName) {
      const enrichment = await enrichTranscript(turns);
      if (!summary) summary = enrichment.summary;
      if (!sentiment) sentiment = enrichment.sentiment;
      if (!complaintData) {
        complaintData = {
          bodyArea: enrichment.bodyArea,
          description: `Patient reported symptoms in ${enrichment.bodyArea}.`,
          severity: enrichment.severity,
        };
      }
      enrichmentName = enrichment.extractedName;
    }

    // Never overwrite or miss "booked" if an appointment exists
    if (providedAppointment || (existingCall?.appointments && existingCall.appointments.length > 0)) {
      outcome = "booked";
    } else if (!outcome) {
      if (existingCall?.outcome && existingCall.outcome !== "no_booking") {
        outcome = existingCall.outcome as any;
      } else {
        outcome = "no_booking";
      }
    }

    if (outcome === "booked" && summary && summary.includes("No appointment was finalized")) {
      summary = summary.replace("No appointment was finalized on this call.", "An assessment appointment was successfully booked.");
    }

    // 3. Resolve Patient Name from spoken name or payload
    let finalFirstName = "";
    let finalLastName = "";

    if (typeof providedPatientName === "string" && providedPatientName.trim()) {
      const parts = providedPatientName.trim().split(/\s+/);
      finalFirstName = parts[0];
      finalLastName = parts.slice(1).join(" ") || "";
    } else if (providedPatientName && typeof providedPatientName === "object") {
      finalFirstName = providedPatientName.firstName || "";
      finalLastName = providedPatientName.lastName || "";
    } else if (enrichmentName) {
      finalFirstName = enrichmentName.firstName || "";
      finalLastName = enrichmentName.lastName || "";
    }

    // Guard against erroneous "For Calling" name extraction
    if (finalFirstName.toLowerCase() === "for" && (finalLastName.toLowerCase() === "calling" || !finalLastName)) {
      finalFirstName = "";
      finalLastName = "";
    }

    // 4. Resolve / Create Patient Record
    let patientId = existingCall?.patientId;
    const effectivePhone = providedPhone || existingCall?.callerPhone || "Unknown";

    // If an existing patient already exists and has a real name, don't clear it
    if (!finalFirstName && existingCall?.patient && existingCall.patient.firstName.toLowerCase() !== "for") {
      finalFirstName = existingCall.patient.firstName;
      finalLastName = existingCall.patient.lastName;
    }

    if (finalFirstName) {
      let patient = null;
      if (effectivePhone && effectivePhone !== "Unknown") {
        patient = await prisma.patient.findUnique({
          where: { phone: effectivePhone },
        });
      }

      if (patient) {
        patient = await prisma.patient.update({
          where: { id: patient.id },
          data: {
            firstName: finalFirstName,
            lastName: finalLastName || patient.lastName,
          },
        });
      } else {
        patient = await prisma.patient.create({
          data: {
            firstName: finalFirstName,
            lastName: finalLastName || "Patient",
            phone: effectivePhone !== "Unknown" ? effectivePhone : `+1${Date.now().toString().slice(-10)}`,
            patientType: "new",
          },
        });
      }
      patientId = patient.id;
    }

    // 5. Calculate duration if needed
    const endDateTime = endedAt ? new Date(endedAt) : new Date();
    let calculatedDuration = durationSeconds;
    if (calculatedDuration === undefined) {
      if (existingCall?.startedAt) {
        calculatedDuration = Math.max(
          0,
          Math.floor((endDateTime.getTime() - existingCall.startedAt.getTime()) / 1000)
        );
      } else {
        calculatedDuration = 60;
      }
    }

    // 6. Update or Upsert Call
    const updatedCall = await prisma.call.upsert({
      where: { id: callId },
      update: {
        endedAt: endDateTime,
        durationSeconds: calculatedDuration,
        status,
        outcome,
        summary,
        sentiment,
        patientId: patientId ?? undefined,
        callerPhone: effectivePhone !== "Unknown" ? effectivePhone : undefined,
        recordingUrl: recordingUrl ?? undefined,
      },
      create: {
        id: callId,
        callerPhone: effectivePhone,
        startedAt: new Date(endDateTime.getTime() - calculatedDuration * 1000),
        endedAt: endDateTime,
        durationSeconds: calculatedDuration,
        status,
        outcome,
        summary,
        sentiment,
        patientId: patientId ?? null,
        recordingUrl: recordingUrl ?? null,
      },
    });

    // 7. Save Complaint if patient is associated
    if (complaintData && updatedCall.patientId) {
      await prisma.complaint.create({
        data: {
          callId: updatedCall.id,
          patientId: updatedCall.patientId,
          bodyArea: complaintData.bodyArea.toLowerCase(),
          description: complaintData.description,
          severity: complaintData.severity ?? 3,
        },
      });
    }

    // 8. Save Appointment if booked
    let createdAppointment = null;
    if (providedAppointment && updatedCall.patientId) {
      createdAppointment = await prisma.appointment.create({
        data: {
          callId: updatedCall.id,
          patientId: updatedCall.patientId,
          startsAt: new Date(providedAppointment.startsAt),
          type: providedAppointment.type,
          insuranceDirectBilling: providedAppointment.insuranceDirectBilling,
          status: providedAppointment.status,
        },
      });
    }

    return NextResponse.json({
      success: true,
      callId: updatedCall.id,
      patientId: updatedCall.patientId,
      outcome: updatedCall.outcome,
      sentiment: updatedCall.sentiment,
      summary: updatedCall.summary,
      appointmentId: createdAppointment?.id ?? null,
      message: "Call finalized, patient updated, and saved successfully.",
    });
  } catch (err: any) {
    console.error("Error in /api/webhooks/call-ended:", err);
    return NextResponse.json({ error: "Internal server error", message: err.message }, { status: 500 });
  }
}
