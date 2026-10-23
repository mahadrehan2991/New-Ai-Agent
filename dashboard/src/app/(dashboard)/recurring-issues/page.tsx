import { prisma } from "@/lib/prisma";
import Link from "next/link";
import MaskedPhone from "@/components/MaskedPhone";
import RecurringCharts from "@/components/RecurringCharts";
import {
  AlertTriangle,
  Activity,
  Calendar,
  Flame,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface GroupData {
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
  bodyArea: string;
  count: number;
  firstDate: Date;
  lastDate: Date;
  severities: number[];
  descriptions: string[];
}

export default async function RecurringIssuesPage() {
  const complaints = await prisma.complaint.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      patient: true,
      call: true,
    },
  });

  // Group by `${patientId}_${bodyArea}`
  const groupMap = new Map<string, GroupData>();
  // Body area tallies across clinic
  const areaTotals: Record<string, { count: number; highSeverityCount: number }> = {
    "lower back": { count: 0, highSeverityCount: 0 },
    neck: { count: 0, highSeverityCount: 0 },
    shoulder: { count: 0, highSeverityCount: 0 },
    knee: { count: 0, highSeverityCount: 0 },
    hip: { count: 0, highSeverityCount: 0 },
    other: { count: 0, highSeverityCount: 0 },
  };

  for (const c of complaints) {
    const area = c.bodyArea.toLowerCase();
    if (!areaTotals[area]) {
      areaTotals[area] = { count: 0, highSeverityCount: 0 };
    }
    areaTotals[area].count += 1;
    if (c.severity && c.severity >= 4) {
      areaTotals[area].highSeverityCount += 1;
    }

    const key = `${c.patientId}___${c.bodyArea.toLowerCase()}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        patient: {
          id: c.patient.id,
          firstName: c.patient.firstName,
          lastName: c.patient.lastName,
          phone: c.patient.phone,
        },
        bodyArea: c.bodyArea,
        count: 1,
        firstDate: c.createdAt,
        lastDate: c.createdAt,
        severities: c.severity ? [c.severity] : [],
        descriptions: [c.description],
      });
    } else {
      const g = groupMap.get(key)!;
      g.count += 1;
      g.lastDate = c.createdAt;
      if (c.severity) g.severities.push(c.severity);
      g.descriptions.push(c.description);
    }
  }

  // Filter to only those with 2 or more mentions
  const recurringGroups = Array.from(groupMap.values()).filter((g) => g.count >= 2);

  // Sort: Needs follow-up first, then highest count
  recurringGroups.sort((a, b) => {
    const aNeedsFollowUp = a.count >= 3 || a.severities.some((s) => s >= 4);
    const bNeedsFollowUp = b.count >= 3 || b.severities.some((s) => s >= 4);
    if (aNeedsFollowUp && !bNeedsFollowUp) return -1;
    if (!aNeedsFollowUp && bNeedsFollowUp) return 1;
    return b.count - a.count;
  });

  const chartData = Object.entries(areaTotals).map(([area, data]) => ({
    area: area.charAt(0).toUpperCase() + area.slice(1),
    count: data.count,
    highSeverityCount: data.highSeverityCount,
  }));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-rose-600/10 dark:bg-rose-400/10 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Recurring Issues & Chronic Pain Tracking
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Identifies patients mentioning the same anatomical complaint across multiple calls for clinical proactive follow-up.
          </p>
        </div>
      </div>

      {/* Chart */}
      <RecurringCharts data={chartData} />

      {/* Recurring Cases Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Patients with Recurring Complaints ({recurringGroups.length})
          </h2>
          <span className="text-xs text-slate-400">
            Criteria: &ge;2 call mentions of identical body area
          </span>
        </div>

        {recurringGroups.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center text-slate-400">
            No recurring patient issues detected.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recurringGroups.map((group, idx) => {
              const needsFollowUp =
                group.count >= 3 || group.severities.some((s) => s >= 4);

              // Calculate severity trend
              const firstSev = group.severities[0];
              const lastSev = group.severities[group.severities.length - 1];
              const isIncreasing = lastSev > firstSev;
              const isDecreasing = lastSev < firstSev;

              return (
                <div
                  key={idx}
                  className={`bg-white dark:bg-slate-900 rounded-2xl border p-5 shadow-sm space-y-4 relative overflow-hidden ${
                    needsFollowUp
                      ? "border-rose-200 dark:border-rose-900/60 ring-1 ring-rose-500/20"
                      : "border-slate-200 dark:border-slate-800"
                  }`}
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/patients/${group.patient.id}`}
                          className="font-bold text-base text-slate-900 dark:text-white hover:text-teal-600 transition-colors"
                        >
                          {group.patient.firstName} {group.patient.lastName}
                        </Link>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        <MaskedPhone phone={group.patient.phone} />
                      </div>
                    </div>

                    {needsFollowUp ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400 border border-rose-200 dark:border-rose-800 animate-pulse">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Needs Follow-up
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Monitoring
                      </span>
                    )}
                  </div>

                  {/* Complaint Details */}
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-2 border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5" />
                        {group.bodyArea}
                      </span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                        {group.count} Call Mentions
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                      &quot;{group.descriptions[group.descriptions.length - 1]}&quot;
                    </p>
                  </div>

                  {/* Date and Severity Trend Footer */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {new Date(group.firstDate).toLocaleDateString()} &rarr;{" "}
                        {new Date(group.lastDate).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Trend */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">Severity:</span>
                      <div className="flex items-center gap-1 font-mono font-semibold">
                        {group.severities.map((s, i) => (
                          <span
                            key={i}
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                              s >= 4
                                ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400"
                                : s >= 3
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                            }`}
                          >
                            {s}
                          </span>
                        ))}
                      </div>

                      {isIncreasing && (
                        <span className="text-rose-600 dark:text-rose-400 flex items-center text-[10px] font-bold">
                          <TrendingUp className="w-3.5 h-3.5" /> Escalating
                        </span>
                      )}
                      {isDecreasing && (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center text-[10px] font-bold">
                          <TrendingDown className="w-3.5 h-3.5" /> Improving
                        </span>
                      )}
                      {!isIncreasing && !isDecreasing && (
                        <span className="text-slate-400 flex items-center text-[10px]">
                          <Minus className="w-3.5 h-3.5" /> Stable
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
