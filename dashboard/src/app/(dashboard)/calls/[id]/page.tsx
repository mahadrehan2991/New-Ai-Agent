import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import MaskedPhone from "@/components/MaskedPhone";
import CallDetailTools from "@/components/CallDetailTools";
import {
  ArrowLeft,
  PhoneCall,
  User,
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
  Smile,
  Meh,
  Frown,
  Volume2,
  FileText,
  Activity,
  CreditCard,
  UserCheck,
  Flame,
} from "lucide-react";

export const dynamic = "force-dynamic";

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function formatFullDateTime(d: Date) {
  return d.toLocaleString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const call = await prisma.call.findUnique({
    where: { id },
    include: {
      patient: true,
      transcriptTurns: {
        orderBy: { timestamp: "asc" },
      },
      complaints: true,
      appointments: true,
      toolEvents: {
        orderBy: { timestamp: "asc" },
      },
    },
  });

  if (!call) {
    notFound();
  }

  const primaryComplaint = call.complaints[0];
  const primaryAppointment = call.appointments[0];

  const outcomeStyles: Record<string, string> = {
    booked: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
    no_booking: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    existing_lookup: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    out_of_scope: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border-rose-200 dark:border-rose-800",
  };

  const outcomeLabels: Record<string, string> = {
    booked: "Booked Appointment",
    no_booking: "No Booking Made",
    existing_lookup: "Existing Patient Lookup",
    out_of_scope: "Out of Scope Inquiry",
  };

  return (
    <div className="space-y-6">
      {/* Top back navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/calls"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Call Logs</span>
        </Link>
        <span className="text-xs font-mono text-slate-400">Call ID: {call.id}</span>
      </div>

      {/* Hero Header Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                {call.patient
                  ? `${call.patient.firstName} ${call.patient.lastName}`
                  : "Unregistered Caller"}
              </h1>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                  outcomeStyles[call.outcome] || "bg-slate-100 text-slate-700"
                }`}
              >
                {call.outcome === "booked" && <CheckCircle2 className="w-3.5 h-3.5" />}
                {call.outcome === "no_booking" && <HelpCircle className="w-3.5 h-3.5" />}
                {call.outcome === "out_of_scope" && <XCircle className="w-3.5 h-3.5" />}
                {outcomeLabels[call.outcome] || call.outcome}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mt-2">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {formatFullDateTime(call.startedAt)}
              </span>
              <span className="flex items-center gap-1.5 font-mono">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Duration: {formatDuration(call.durationSeconds)}
              </span>
              <span className="flex items-center gap-1.5">
                Caller Phone: <MaskedPhone phone={call.callerPhone} />
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Sentiment */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium">
              <span className="text-slate-400">Sentiment:</span>
              {call.sentiment === "positive" && (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <Smile className="w-4 h-4" /> Positive
                </span>
              )}
              {call.sentiment === "neutral" && (
                <span className="flex items-center gap-1 text-slate-500 dark:text-slate-300 font-semibold">
                  <Meh className="w-4 h-4" /> Neutral
                </span>
              )}
              {call.sentiment === "negative" && (
                <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
                  <Frown className="w-4 h-4" /> Negative
                </span>
              )}
            </div>

            {/* Status */}
            <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold capitalize text-slate-700 dark:text-slate-300">
              Status: {call.status}
            </div>
          </div>
        </div>

        {/* Audio Player */}
        <div className="mt-5 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-600/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Inbound Call Audio
              </div>
              <div className="text-[11px] text-slate-400">
                {call.recordingUrl
                  ? "Encrypted telephony audio track"
                  : "Live inbound reception line"}
              </div>
            </div>
          </div>

          <div className="flex-1 max-w-md">
            {call.recordingUrl ? (
              <audio controls className="w-full h-8" src={call.recordingUrl}>
                Your browser does not support audio playback.
              </audio>
            ) : (
              <div className="text-xs text-slate-400 italic bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-center">
                Audio archived in compliant telecom storage (simulated playback)
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grid: Left Column (Summary & Extracted Fields), Right Column (Transcript & Tools) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Summary & Extracted Fields */}
        <div className="space-y-6 lg:col-span-1">
          {/* Summary Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-teal-700 dark:text-teal-400">
              <FileText className="w-4 h-4" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Clinical Intake Summary
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
              {call.summary || "No automated summary generated for this call."}
            </p>
          </div>

          {/* Extracted Fields Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400">
              <UserCheck className="w-4 h-4" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Extracted Clinical Fields
              </h3>
            </div>

            <div className="space-y-3.5 text-xs divide-y divide-slate-100 dark:divide-slate-800">
              {/* Patient Profile */}
              <div className="pt-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Patient Identity
                </span>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {call.patient
                      ? `${call.patient.firstName} ${call.patient.lastName}`
                      : "Unregistered / Unknown"}
                  </span>
                  {call.patient && (
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {call.patient.patientType} Patient
                    </span>
                  )}
                </div>
              </div>

              {/* Complaint & Body Area */}
              <div className="pt-3">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Reported Symptom / Area
                </span>
                {primaryComplaint ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold capitalize text-teal-600 dark:text-teal-400 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5" />
                        {primaryComplaint.bodyArea}
                      </span>
                      {primaryComplaint.severity && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                            primaryComplaint.severity >= 4
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-400"
                              : primaryComplaint.severity >= 3
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-400"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-400"
                          }`}
                        >
                          <Flame className="w-2.5 h-2.5" />
                          Severity: {primaryComplaint.severity}/5
                        </span>
                      )}
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-snug">
                      {primaryComplaint.description}
                    </p>
                  </div>
                ) : (
                  <span className="text-slate-400 italic">No specific complaint recorded</span>
                )}
              </div>

              {/* Booked Slot */}
              <div className="pt-3">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Requested Appointment Slot
                </span>
                {primaryAppointment ? (
                  <div className="space-y-1">
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      {new Date(primaryAppointment.startsAt).toLocaleString("en-CA", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                        timeZone: "UTC",
                      })}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="capitalize">{primaryAppointment.type} Assessment</span>
                      <span>•</span>
                      <span className="capitalize font-medium text-teal-600 dark:text-teal-400">
                        {primaryAppointment.status}
                      </span>
                    </div>
                  </div>
                ) : (
                  <span className="text-slate-400 italic">No appointment was scheduled</span>
                )}
              </div>

              {/* Direct Billing / Insurance */}
              <div className="pt-3">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Insurance / Direct Billing
                </span>
                <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                  <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {primaryAppointment?.insuranceDirectBilling
                      ? "Yes — Patient requested direct billing"
                      : "Self-pay / Out of pocket"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Chat Transcript & Tool Timeline */}
        <div className="space-y-6 lg:col-span-2">
          {/* Chat-style Transcript */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Multi-Turn Call Transcript ({call.transcriptTurns.length} turns)
              </h3>
              <span className="text-xs text-slate-400">Hannah (Receptionist) & Caller</span>
            </div>

            {call.transcriptTurns.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No transcript turns captured for this call.
              </div>
            ) : (
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {call.transcriptTurns.map((turn) => {
                  const isAgent = turn.role === "agent";
                  return (
                    <div
                      key={turn.id}
                      className={`flex gap-3 ${isAgent ? "justify-start" : "justify-end"}`}
                    >
                      {/* Agent avatar on left */}
                      {isAgent && (
                        <div className="w-8 h-8 rounded-full bg-teal-700 text-white flex items-center justify-center shrink-0 shadow-xs">
                          <PhoneCall className="w-3.5 h-3.5" />
                        </div>
                      )}

                      {/* Bubble */}
                      <div
                        className={`max-w-[80%] rounded-2xl p-4 text-xs leading-relaxed space-y-1.5 shadow-xs ${
                          isAgent
                            ? "bg-teal-50/80 dark:bg-teal-950/40 text-slate-800 dark:text-slate-100 border border-teal-100 dark:border-teal-900/50 rounded-tl-none"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-tr-none"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4 text-[10px] font-semibold text-slate-400">
                          <span>{isAgent ? "Hannah (Reception)" : "Caller"}</span>
                          <span>
                            {new Date(turn.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="text-xs">{turn.text}</p>
                      </div>

                      {/* Caller avatar on right */}
                      {!isAgent && (
                        <div className="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center shrink-0 shadow-sm">
                          <User className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tool Timeline */}
          <CallDetailTools
            tools={call.toolEvents.map((t) => ({
              id: t.id,
              toolName: t.toolName,
              arguments: t.arguments,
              result: t.result,
              durationMs: t.durationMs,
              success: t.success,
              timestamp: t.timestamp.toISOString(),
            }))}
          />
        </div>
      </div>
    </div>
  );
}
