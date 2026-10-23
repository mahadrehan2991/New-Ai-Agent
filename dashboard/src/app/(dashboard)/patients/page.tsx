import { prisma } from "@/lib/prisma";
import PatientsClient, { PatientListItem } from "@/components/PatientsClient";
import { Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PatientsPage() {
  const rawPatients = await prisma.patient.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      calls: {
        select: { id: true },
      },
      appointments: {
        select: { id: true },
      },
      complaints: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          bodyArea: true,
          severity: true,
        },
      },
    },
  });

  const patients: PatientListItem[] = rawPatients.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    phone: p.phone,
    patientType: p.patientType,
    firstSeenAt: p.firstSeenAt.toISOString(),
    totalCalls: p.calls.length,
    totalAppointments: p.appointments.length,
    latestComplaintArea: p.complaints[0]?.bodyArea || null,
    latestComplaintSeverity: p.complaints[0]?.severity || null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-600/10 dark:bg-teal-400/10 flex items-center justify-center text-teal-600 dark:text-teal-400">
            <Users className="w-4 h-4" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Patients Directory
          </h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Registered patient profiles, clinical symptom histories, and past voice interactions.
        </p>
      </div>

      <PatientsClient initialPatients={patients} />
    </div>
  );
}
