import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import MaskedPhone from "@/components/MaskedPhone";
import {
  ArrowLeft,
  User,
  Phone,
  Calendar,
  Clock,
  Activity,
  CreditCard,
  PhoneCall,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Flame,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";

export const dynamic = "force-dynamic";

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export default async function PatientProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const patient = await prisma.patient.findUnique({
    where: { id },
    include: {
      calls: {
        orderBy: { startedAt: "desc" },
      },
      appointments: {
        orderBy: { startsAt: "desc" },
      },
      complaints: {
        orderBy: { createdAt: "desc" },
        include: {
          call: {
            select: { id: true, startedAt: true },
          },
        },
      },
    },
  });

  if (!patient) {
    notFound();
  }

  // Count recurring body areas
  const areaCounts: Record<string, number> = {};
  patient.complaints.forEach((c) => {
    areaCounts[c.bodyArea] = (areaCounts[c.bodyArea] || 0) + 1;
  });
  const recurringAreas = Object.entries(areaCounts).filter(([_, count]) => count >= 2);

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link
          href="/patients"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Patients Directory</span>
        </Link>
      </div>

      {/* Patient Header Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-teal-600/10 dark:bg-teal-400/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold text-xl">
              {patient.firstName[0]}
              {patient.lastName[0]}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                  {patient.firstName} {patient.lastName}
                </h1>
                <span
                  className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full border ${
                    patient.patientType === "new"
                      ? "bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400 border-teal-200 dark:border-teal-800"
                      : "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 border-blue-200 dark:border-blue-800"
                  }`}
                >
                  {patient.patientType} Patient
                </span>
                {recurringAreas.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                    <ShieldAlert className="w-3 h-3" />
                    Recurring Condition
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mt-2">
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <MaskedPhone phone={patient.phone} />
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  First seen: {new Date(patient.firstSeenAt).toLocaleDateString()}
                </span>
                <span className="font-mono text-slate-400">ID: {patient.id}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-center border border-slate-100 dark:border-slate-800">
              <div className="text-lg font-bold text-slate-900 dark:text-white">
                {patient.calls.length}
              </div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Total Calls</div>
            </div>
            <div className="px-4 py-2 bg-teal-50 dark:bg-teal-950/40 rounded-xl text-center border border-teal-100 dark:border-teal-900">
              <div className="text-lg font-bold text-teal-700 dark:text-teal-300">
                {patient.appointments.length}
              </div>
              <div className="text-[10px] uppercase font-bold text-teal-600/80 dark:text-teal-400">
                Appointments
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Complaint History Timeline */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400">
                <Activity className="w-4 h-4" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Complaint History Timeline
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {patient.complaints.length} records
              </span>
            </div>

            {patient.complaints.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 italic">
                No clinical complaints on file.
              </div>
            ) : (
              <div className="space-y-4 relative before:absolute before:inset-0 before:left-3 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800 pl-6">
                {patient.complaints.map((c) => (
                  <div key={c.id} className="relative space-y-1">
                    {/* Circle on line */}
                    <div className="absolute -left-6 top-1 w-3 h-3 rounded-full border-2 border-teal-600 bg-white dark:bg-slate-900" />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white capitalize">
                        {c.bodyArea}
                      </span>
                      {c.severity && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                            c.severity >= 4
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-400"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-400"
                          }`}
                        >
                          <Flame className="w-2.5 h-2.5" />
                          Sev {c.severity}/5
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {c.description}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                      <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                      {c.call && (
                        <Link
                          href={`/calls/${c.call.id}`}
                          className="text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-0.5"
                        >
                          <span>From Call</span>
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Past Calls & Appointments */}
        <div className="lg:col-span-2 space-y-6">
          {/* Appointments */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400">
                <Calendar className="w-4 h-4" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Clinic Appointments ({patient.appointments.length})
                </h3>
              </div>
            </div>

            {patient.appointments.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 italic">
                No clinic appointments recorded for this patient.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {patient.appointments.map((appt) => (
                  <div
                    key={appt.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {new Date(appt.startsAt).toLocaleString("en-CA", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                          timeZone: "UTC",
                        })}
                      </div>
                      <div className="flex items-center gap-2 text-slate-500 text-[11px] mt-0.5">
                        <span className="capitalize">{appt.type} Session</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <CreditCard className="w-3 h-3" />
                          {appt.insuranceDirectBilling ? "Direct Billing" : "Self-pay"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                          appt.status === "completed"
                            ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            : appt.status === "booked"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                            : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
                        }`}
                      >
                        {appt.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Past Calls */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400">
                <PhoneCall className="w-4 h-4" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Past Voice Calls ({patient.calls.length})
                </h3>
              </div>
            </div>

            {patient.calls.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 italic">
                No past calls logged for this patient.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {patient.calls.map((call) => (
                  <Link
                    key={call.id}
                    href={`/calls/${call.id}`}
                    className="py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 p-2 rounded-xl transition-colors group"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {new Date(call.startedAt).toLocaleString("en-CA", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </span>
                        <span className="font-mono text-slate-400 text-[11px]">
                          {formatDuration(call.durationSeconds)}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 capitalize">
                          {call.outcome.replace("_", " ")}
                        </span>
                      </div>
                      {call.summary && (
                        <p className="text-slate-500 dark:text-slate-400 text-[11px] line-clamp-1 max-w-lg">
                          {call.summary}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold text-slate-400">
                        {call.sentiment}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-teal-600 transition-colors" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
