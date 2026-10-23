import { prisma } from "@/lib/prisma";
import AppointmentsClient, { AppointmentItem } from "@/components/AppointmentsClient";
import { CalendarCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AppointmentsPage() {
  const rawAppointments = await prisma.appointment.findMany({
    orderBy: { startsAt: "desc" },
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          patientType: true,
        },
      },
    },
  });

  const appointments: AppointmentItem[] = rawAppointments.map((a) => ({
    id: a.id,
    startsAt: a.startsAt.toISOString(),
    type: a.type,
    insuranceDirectBilling: a.insuranceDirectBilling,
    status: a.status,
    callId: a.callId,
    patient: a.patient,
  }));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-600/10 dark:bg-teal-400/10 flex items-center justify-center text-teal-600 dark:text-teal-400">
            <CalendarCheck className="w-4 h-4" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Clinic Appointments
          </h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Review booked patient slots, assessment sessions, and direct billing statuses across month, week, or list views.
        </p>
      </div>

      <AppointmentsClient initialAppointments={appointments} />
    </div>
  );
}
