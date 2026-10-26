import { prisma } from "@/lib/prisma";
import CallsClient, { CallListItem } from "@/components/CallsClient";
import { PhoneCall } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CallsPage() {
  const rawCalls = await prisma.call.findMany({
    orderBy: { startedAt: "desc" },
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          patientType: true,
        },
      },
      complaints: {
        select: {
          bodyArea: true,
          severity: true,
        },
      },
    },
  });

  const calls: CallListItem[] = rawCalls.map((c) => ({
    id: c.id,
    startedAt: c.startedAt.toISOString(),
    durationSeconds: c.durationSeconds,
    callerPhone: c.callerPhone,
    status: c.status,
    outcome: c.outcome,
    summary: c.summary,
    sentiment: c.sentiment,
    recordingUrl: c.recordingUrl,
    patient: c.patient,
    complaints: c.complaints,
  }));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-600/10 dark:bg-teal-400/10 flex items-center justify-center text-teal-600 dark:text-teal-400">
              <PhoneCall className="w-4 h-4" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Call Logs
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Review Justine receptionist voice interactions, outcomes, and automated triage records.
          </p>
        </div>
      </div>

      {/* Main calls table component with interactive filters & CSV export */}
      <CallsClient initialCalls={calls} />
    </div>
  );
}
