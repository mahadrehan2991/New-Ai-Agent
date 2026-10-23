"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Download,
  Filter,
  Phone,
  Clock,
  Calendar,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertCircle,
  Smile,
  Meh,
  Frown,
  ArrowUpDown,
  Volume2,
} from "lucide-react";
import MaskedPhone from "@/components/MaskedPhone";

export interface CallListItem {
  id: string;
  startedAt: string;
  durationSeconds: number;
  callerPhone: string;
  status: string;
  outcome: string;
  summary: string | null;
  sentiment: string;
  recordingUrl: string | null;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    patientType: string;
  } | null;
  complaints: {
    bodyArea: string;
    severity: number | null;
  }[];
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export default function CallsClient({ initialCalls }: { initialCalls: CallListItem[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all"); // all, today, 7d, 30d
  const [page, setPage] = useState(1);
  const pageSize = 12;

  // Filter calls
  const filteredCalls = useMemo(() => {
    const now = new Date();
    return initialCalls.filter((c) => {
      // Search phone, patient name, or summary
      if (search.trim()) {
        const query = search.toLowerCase();
        const patientName = c.patient ? `${c.patient.firstName} ${c.patient.lastName}`.toLowerCase() : "";
        const matchesPhone = c.callerPhone.includes(query);
        const matchesName = patientName.includes(query);
        const matchesSummary = c.summary ? c.summary.toLowerCase().includes(query) : false;
        if (!matchesPhone && !matchesName && !matchesSummary) return false;
      }

      // Status filter
      if (statusFilter !== "all" && c.status !== statusFilter) return false;

      // Outcome filter
      if (outcomeFilter !== "all" && c.outcome !== outcomeFilter) return false;

      // Date range filter
      if (dateRange !== "all") {
        const callDate = new Date(c.startedAt);
        const diffMs = now.getTime() - callDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (dateRange === "today" && diffDays > 1) return false;
        if (dateRange === "7d" && diffDays > 7) return false;
        if (dateRange === "30d" && diffDays > 30) return false;
      }

      return true;
    });
  }, [initialCalls, search, statusFilter, outcomeFilter, dateRange]);

  // Pagination
  const totalPages = Math.ceil(filteredCalls.length / pageSize) || 1;
  const paginatedCalls = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredCalls.slice(start, start + pageSize);
  }, [filteredCalls, page]);

  // Export to CSV
  function exportCSV() {
    const headers = ["Call ID", "Date Time", "Caller Phone", "Patient Name", "Duration (s)", "Status", "Outcome", "Sentiment", "Summary"];
    const rows = filteredCalls.map((c) => [
      c.id,
      new Date(c.startedAt).toISOString(),
      `"${c.callerPhone}"`,
      c.patient ? `"${c.patient.firstName} ${c.patient.lastName}"` : "Unregistered",
      c.durationSeconds,
      c.status,
      c.outcome,
      c.sentiment,
      c.summary ? `"${c.summary.replace(/"/g, '""')}"` : "",
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `happy-harmony-calls-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="space-y-6">
      {/* Top action row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by phone, patient name, or notes..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Outcome Filter */}
          <select
            value={outcomeFilter}
            onChange={(e) => {
              setOutcomeFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by outcome"
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-700 dark:text-slate-300 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
          >
            <option value="all">All Outcomes</option>
            <option value="booked">Booked</option>
            <option value="no_booking">No Booking</option>
            <option value="existing_lookup">Existing Lookup</option>
            <option value="out_of_scope">Out of Scope</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-700 dark:text-slate-300 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="abandoned">Abandoned</option>
            <option value="transferred">Transferred</option>
            <option value="failed">Failed</option>
          </select>

          {/* Date Range Filter */}
          <select
            value={dateRange}
            onChange={(e) => {
              setDateRange(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by date range"
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-700 dark:text-slate-300 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>

          {/* CSV Export Button */}
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/50 dark:hover:bg-teal-900/50 text-teal-700 dark:text-teal-300 rounded-xl text-xs font-semibold border border-teal-200 dark:border-teal-800 transition-colors cursor-pointer"
            title="Export filtered records to CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">
                <th className="py-3.5 px-4">Date & Time</th>
                <th className="py-3.5 px-4">Caller Phone</th>
                <th className="py-3.5 px-4">Patient</th>
                <th className="py-3.5 px-4">Duration</th>
                <th className="py-3.5 px-4">Outcome</th>
                <th className="py-3.5 px-4">Sentiment</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
              {paginatedCalls.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 dark:text-slate-500 text-sm">
                    No calls match your search and filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedCalls.map((call) => {
                  const outcomeStyles: Record<string, string> = {
                    booked: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
                    no_booking: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border-amber-200 dark:border-amber-800",
                    existing_lookup: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 border-blue-200 dark:border-blue-800",
                    out_of_scope: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border-rose-200 dark:border-rose-800",
                  };

                  const outcomeLabels: Record<string, string> = {
                    booked: "Booked",
                    no_booking: "No Booking",
                    existing_lookup: "Lookup",
                    out_of_scope: "Out of Scope",
                  };

                  const statusStyles: Record<string, string> = {
                    completed: "text-slate-600 dark:text-slate-300",
                    abandoned: "text-amber-600 dark:text-amber-400 font-medium",
                    transferred: "text-blue-600 dark:text-blue-400 font-medium",
                    failed: "text-rose-600 dark:text-rose-400 font-medium",
                  };

                  return (
                    <tr
                      key={call.id}
                      onClick={() => router.push(`/calls/${call.id}`)}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition-colors group"
                    >
                      {/* Date & Time */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300 font-medium">
                        {formatDateTime(call.startedAt)}
                      </td>

                      {/* Phone with Mask */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <MaskedPhone phone={call.callerPhone} />
                      </td>

                      {/* Patient */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {call.patient ? (
                          <div>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {call.patient.firstName} {call.patient.lastName}
                            </span>
                            <span className="ml-2 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                              {call.patient.patientType}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Unregistered</span>
                        )}
                      </td>

                      {/* Duration */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {formatDuration(call.durationSeconds)}
                      </td>

                      {/* Outcome Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                            outcomeStyles[call.outcome] || "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {call.outcome === "booked" && <CheckCircle2 className="w-3 h-3" />}
                          {call.outcome === "no_booking" && <HelpCircle className="w-3 h-3" />}
                          {call.outcome === "out_of_scope" && <XCircle className="w-3 h-3" />}
                          {outcomeLabels[call.outcome] || call.outcome}
                        </span>
                      </td>

                      {/* Sentiment */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {call.sentiment === "positive" && (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                            <Smile className="w-4 h-4" />
                            <span>Positive</span>
                          </span>
                        )}
                        {call.sentiment === "neutral" && (
                          <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 text-xs font-medium">
                            <Meh className="w-4 h-4" />
                            <span>Neutral</span>
                          </span>
                        )}
                        {call.sentiment === "negative" && (
                          <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 text-xs font-medium">
                            <Frown className="w-4 h-4" />
                            <span>Negative</span>
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs capitalize">
                        <span className={statusStyles[call.status] || ""}>{call.status}</span>
                      </td>

                      {/* Arrow link */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-right">
                        <span className="inline-flex p-1 rounded-lg text-slate-400 group-hover:text-teal-600 group-hover:bg-teal-50 dark:group-hover:bg-teal-950/60 transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer with pagination */}
        <div className="py-3.5 px-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div>
            Showing <span className="font-semibold text-slate-700 dark:text-slate-200">{(page - 1) * pageSize + (filteredCalls.length ? 1 : 0)}</span> to{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-200">{Math.min(page * pageSize, filteredCalls.length)}</span> of{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-200">{filteredCalls.length}</span> calls
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPage((p) => Math.max(1, p - 1));
              }}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-medium">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPage((p) => Math.min(totalPages, p + 1));
              }}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
