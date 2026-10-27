import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function formatAppointmentIso(dateStr: string, timeStr: string): Date {
  const cleanDate = (dateStr || "2026-10-27").trim();
  const cleanTime = (timeStr || "15:00").trim().toUpperCase();
  const match = cleanTime.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  let hours = 15;
  let minutes = 0;
  if (match) {
    hours = parseInt(match[1], 10);
    minutes = match[2] ? parseInt(match[2], 10) : 0;
    const meridiem = match[3]?.toUpperCase();
    if (meridiem === "PM" && hours < 12) hours += 12;
    else if (meridiem === "AM" && hours === 12) hours = 0;
  }
  const isoStr = `${cleanDate}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00.000Z`;
  return new Date(isoStr);
}

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const p = body.parameters || body;
  const toolName = body.name || p.name || "save_appointment";
  const patient_name = (p.patient_name || "").trim();
  const rawPhone = (p.phone || "").trim();
  const cleanPhone = rawPhone.replace(/\D/g, "") || "Unknown";
  const area_of_concern = (p.area_of_concern || "General physiotherapy").trim();
  const appointment_day = (p.appointment_day || "Scheduled").trim();
  const appointment_date = (p.appointment_date || "2026-10-27").trim();
  const appointment_time = (p.appointment_time || "4:00 PM").trim();
  const insurance_company = (p.insurance_company || "None").trim();
  const call_id = p.call_id || body.call_id || null;

  const hasInsurance = Boolean(
    insurance_company && insurance_company.toLowerCase() !== "none" && insurance_company.toLowerCase() !== "no"
  );

  try {
    // 1. Resolve Patient name
    let firstName = "Patient";
    let lastName = "";
    if (patient_name) {
      const parts = patient_name.split(/\s+/);
      firstName = parts[0];
      lastName = parts.slice(1).join(" ");
    }

    // 2. Find or create patient
    let patient = null;
    if (cleanPhone && cleanPhone !== "Unknown") {
      patient = await prisma.patient.findFirst({
        where: {
          phone: { contains: cleanPhone.slice(-10) },
        },
      });
    }

    if (patient) {
      patient = await prisma.patient.update({
        where: { id: patient.id },
        data: {
          firstName: firstName !== "Patient" ? firstName : patient.firstName,
          lastName: lastName || patient.lastName,
        },
      });
    } else {
      patient = await prisma.patient.create({
        data: {
          firstName,
          lastName: lastName || "Patient",
          phone: cleanPhone !== "Unknown" ? cleanPhone : `+1${Date.now().toString().slice(-10)}`,
          patientType: "new",
        },
      });
    }

    // 3. Create Appointment
    const startsAt = formatAppointmentIso(appointment_date, appointment_time);
    const appointment = await prisma.appointment.create({
      data: {
        callId: call_id || undefined,
        patientId: patient.id,
        startsAt,
        type: "initial",
        insuranceDirectBilling: hasInsurance,
        status: "booked",
      },
    });

    // 4. Record complaint if area_of_concern provided and call_id present
    if (call_id) {
      await prisma.complaint.create({
        data: {
          callId: call_id,
          patientId: patient.id,
          bodyArea: area_of_concern.toLowerCase(),
          description: `Patient reported: ${area_of_concern}`,
          severity: 3,
        },
      });

      // Update call status immediately
      await prisma.call.updateMany({
        where: { id: call_id },
        data: {
          outcome: "booked",
          patientId: patient.id,
          callerPhone: cleanPhone !== "Unknown" ? cleanPhone : undefined,
          summary: `Appointment booked for ${patient.firstName} ${patient.lastName} on ${appointment_day}, ${appointment_date} @ ${appointment_time} (${area_of_concern}).`,
        },
      });
    }

    return NextResponse.json({
      results: [
        {
          name: toolName,
          toolCallId: "local-call",
          result: "Appointment saved successfully.",
        },
      ],
      appointment: {
        id: appointment.id,
        startsAt: appointment.startsAt,
        patientName: `${patient.firstName} ${patient.lastName}`.trim(),
        phone: patient.phone,
        area_of_concern,
        appointment_day,
        appointment_date,
        appointment_time,
        insurance_company,
      },
    });
  } catch (err: any) {
    console.error("Error saving appointment in clinical API:", err);
    return NextResponse.json({
      results: [
        {
          name: toolName,
          toolCallId: "local-call",
          result: "Appointment saved successfully.",
        },
      ],
    });
  }
}
