import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseAppointmentDateTime(dateStr: string, timeStr: string): { targetDate: Date; hours: number } | null {
  if (!dateStr) return null;
  const cleanDate = dateStr.trim();
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
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? null : { targetDate: d, hours };
}

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // query fallback
  }

  const appointment_date = body.appointment_date || body.parameters?.appointment_date || "";
  const appointment_time = body.appointment_time || body.parameters?.appointment_time || "";

  if (!appointment_date) {
    return NextResponse.json({
      results: [
        {
          name: "vapi-check-availability",
          toolCallId: "local-call",
          result: "Please specify the date you would like to book for.",
        },
      ],
    });
  }

  // 1. Check day of week
  const parts = appointment_date.split("-").map(Number);
  const checkDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const dayOfWeek = checkDate.getUTCDay(); // 0 = Sunday, 6 = Saturday

  if (dayOfWeek === 0) {
    return NextResponse.json({
      results: [
        {
          name: "vapi-check-availability",
          toolCallId: "local-call",
          result: "The clinic is closed on Sundays. Please choose a day between Monday and Saturday.",
        },
      ],
    });
  }

  if (!appointment_time.trim()) {
    return NextResponse.json({
      results: [
        {
          name: "vapi-check-availability",
          toolCallId: "local-call",
          result: `The clinic is open on ${appointment_date}. What time would you prefer?`,
        },
      ],
    });
  }

  // 2. Parse time and check operating hours
  const parsed = parseAppointmentDateTime(appointment_date, appointment_time);
  if (!parsed) {
    return NextResponse.json({
      results: [
        {
          name: "vapi-check-availability",
          toolCallId: "local-call",
          result: `Could not recognize time '${appointment_time}'. Please specify a time like 10:00 AM or 3:00 PM.`,
        },
      ],
    });
  }

  const { targetDate, hours } = parsed;

  if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    // Mon-Fri: 10 AM to 6 PM
    if (hours < 10 || hours >= 18) {
      return NextResponse.json({
        results: [
          {
            name: "vapi-check-availability",
            toolCallId: "local-call",
            result: `${appointment_date} at ${appointment_time} is outside clinic hours. Monday to Friday hours are 10:00 AM to 6:00 PM. Please suggest an alternative time.`,
          },
        ],
      });
    }
  } else if (dayOfWeek === 6) {
    // Saturday: 10 AM to 2 PM
    if (hours < 10 || hours >= 14) {
      return NextResponse.json({
        results: [
          {
            name: "vapi-check-availability",
            toolCallId: "local-call",
            result: `${appointment_date} at ${appointment_time} is outside clinic hours. Saturday hours are 10:00 AM to 2:00 PM. Please suggest an alternative time.`,
          },
        ],
      });
    }
  }

  // 3. Query Prisma SQLite for existing booking in that slot window (+/- 25 minutes)
  try {
    const startWindow = new Date(targetDate.getTime() - 25 * 60 * 1000);
    const endWindow = new Date(targetDate.getTime() + 25 * 60 * 1000);

    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        startsAt: {
          gte: startWindow,
          lte: endWindow,
        },
        status: {
          not: "cancelled",
        },
      },
    });

    if (existingAppointment) {
      return NextResponse.json({
        available: false,
        status: "booked",
        result: `${appointment_date} at ${appointment_time} is already booked. Please suggest a different time.`,
        results: [
          {
            name: "vapi-check-availability",
            toolCallId: "local-call",
            result: `${appointment_date} at ${appointment_time} is already booked. Please suggest a different time.`,
          },
        ],
      });
    }

    return NextResponse.json({
      available: true,
      status: "available",
      result: `${appointment_date} at ${appointment_time} is available.`,
      results: [
        {
          name: "vapi-check-availability",
          toolCallId: "local-call",
          result: `${appointment_date} at ${appointment_time} is available.`,
        },
      ],
    });
  } catch (err: any) {
    console.error("Error in check-availability API:", err);
    // Graceful fallback to available if DB transient read error
    return NextResponse.json({
      results: [
        {
          name: "vapi-check-availability",
          toolCallId: "local-call",
          result: `${appointment_date} at ${appointment_time} is available.`,
        },
      ],
    });
  }
}
