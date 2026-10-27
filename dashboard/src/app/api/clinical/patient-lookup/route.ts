import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // fallback
  }

  const rawPhone = body.phone || body.parameters?.phone || "";
  const digits = rawPhone.replace(/\D/g, "");

  if (!digits || digits.length < 7) {
    return NextResponse.json({
      found: false,
      message: "No matching record found for this phone number.",
    });
  }

  try {
    // Search by exact match or last 10 digits
    const last10 = digits.slice(-10);
    const patient = await prisma.patient.findFirst({
      where: {
        phone: {
          contains: last10,
        },
      },
      include: {
        appointments: {
          orderBy: { startsAt: "desc" },
          take: 1,
        },
      },
    });

    if (patient) {
      return NextResponse.json({
        found: true,
        patient: {
          name: `${patient.firstName} ${patient.lastName}`.trim(),
          phone: patient.phone,
          patientType: patient.patientType,
          last_visit: patient.appointments[0]?.startsAt.toISOString().slice(0, 10) || "Recent",
        },
      });
    }

    return NextResponse.json({
      found: false,
      message: "No matching record found for this phone number.",
    });
  } catch (err: any) {
    console.error("Error in patient-lookup API:", err);
    return NextResponse.json({
      found: false,
      message: "No matching record found for this phone number.",
    });
  }
}
