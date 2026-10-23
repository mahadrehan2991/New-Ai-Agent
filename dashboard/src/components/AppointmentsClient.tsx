"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Calendar as CalendarIcon,
  List,
  Clock,
  User,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  XCircle,
  CalendarCheck,
  PhoneCall,
  Search,
} from "lucide-react";
import MaskedPhone from "@/components/MaskedPhone";

export interface AppointmentItem {
  id: string;
  startsAt: string;
  type: string;
  insuranceDirectBilling: boolean;
  status: string;
  callId: string | null;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    patientType: string;
  };
}

function formatApptTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}

function formatApptDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}

export default function AppointmentsClient({ initialAppointments }: { initialAppointments: AppointmentItem[] }) {
  const [view, setView] = useState<"list" | "month" | "week">("month");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDayAppointments, setSelectedDayAppointments] = useState<AppointmentItem[] | null>(null);

  // Filter appointments
  const filteredAppointments = useMemo(() => {
    return initialAppointments.filter((appt) => {
      if (statusFilter !== "all" && appt.status !== statusFilter) return false;
      if (search.trim()) {
        const query = search.toLowerCase();
        const fullName = `${appt.patient.firstName} ${appt.patient.lastName}`.toLowerCase();
        if (!fullName.includes(query) && !appt.patient.phone.includes(query)) return false;
      }
      return true;
    });
  }, [initialAppointments, statusFilter, search]);

  // Calendar calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 is Sunday

  // Month appointments mapping (day -> list)
  const monthAppointments = useMemo(() => {
    const map: Record<number, AppointmentItem[]> = {};
    for (const appt of filteredAppointments) {
      const d = new Date(appt.startsAt);
      if (d.getUTCFullYear() === year && d.getUTCMonth() === month) {
        const day = d.getUTCDate();
        if (!map[day]) map[day] = [];
        map[day].push(appt);
      }
    }
    return map;
  }, [filteredAppointments, year, month]);

  // Week appointments mapping
  const startOfWeek = useMemo(() => {
    const d = new Date(currentDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [currentDate]);

  const weekDays = useMemo(() => {
    const days: { date: Date; appts: AppointmentItem[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      const appts = filteredAppointments.filter((a) => {
        const ad = new Date(a.startsAt);
        return (
          ad.getUTCFullYear() === d.getFullYear() &&
          ad.getUTCMonth() === d.getMonth() &&
          ad.getUTCDate() === d.getDate()
        );
      });
      days.push({ date: d, appts });
    }
    return days;
  }, [startOfWeek, filteredAppointments]);

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDayAppointments(null);
  }

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDayAppointments(null);
  }

  function nextWeek() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  }

  function prevWeek() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  }

  return (
    <div className="space-y-6">
      {/* Top Controls Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search patient name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
          />
        </div>

        {/* View Switch & Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by appointment status"
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-700 dark:text-slate-300 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="booked">Booked</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* View Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => {
                setView("month");
                setSelectedDayAppointments(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                view === "month"
                  ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-300 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Month</span>
            </button>

            <button
              onClick={() => {
                setView("week");
                setSelectedDayAppointments(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                view === "week"
                  ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-300 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Week</span>
            </button>

            <button
              onClick={() => {
                setView("list");
                setSelectedDayAppointments(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                view === "list"
                  ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-300 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
          </div>
        </div>
      </div>

      {/* VIEW: Month Calendar */}
      {view === "month" && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
            {/* Month Header Navigation */}
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {currentDate.toLocaleString("en-CA", { month: "long", year: "numeric" })}
              </h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={prevMonth}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentDate(new Date())}
                  className="px-2.5 py-1 text-xs font-semibold border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Today
                </button>
                <button
                  onClick={nextMonth}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 text-xs">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div
                  key={day}
                  className="bg-slate-50 dark:bg-slate-900 p-2 text-center font-bold text-slate-500 uppercase tracking-wider text-[11px]"
                >
                  {day}
                </div>
              ))}

              {/* Blank offset days */}
              {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
                <div
                  key={`blank-${idx}`}
                  className="bg-slate-50/50 dark:bg-slate-950/40 min-h-[90px] p-2 text-slate-300 dark:text-slate-700"
                />
              ))}

              {/* Month Days */}
              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const day = idx + 1;
                const dayAppts = monthAppointments[day] || [];
                const isToday =
                  new Date().getDate() === day &&
                  new Date().getMonth() === month &&
                  new Date().getFullYear() === year;

                return (
                  <div
                    key={day}
                    onClick={() => dayAppts.length > 0 && setSelectedDayAppointments(dayAppts)}
                    className={`bg-white dark:bg-slate-900 min-h-[90px] p-2 flex flex-col justify-between transition-colors ${
                      dayAppts.length > 0 ? "cursor-pointer hover:bg-teal-50/40 dark:hover:bg-teal-950/20" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center font-semibold text-xs ${
                          isToday
                            ? "bg-teal-600 text-white font-bold"
                            : "text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {day}
                      </span>
                      {dayAppts.length > 0 && (
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-400">
                          {dayAppts.length}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 mt-1">
                      {dayAppts.slice(0, 2).map((a) => (
                        <div
                          key={a.id}
                          className="truncate text-[10px] px-1.5 py-0.5 rounded font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                        >
                          {formatApptTime(a.startsAt)} • {a.patient.firstName} {a.patient.lastName}
                        </div>
                      ))}
                      {dayAppts.length > 2 && (
                        <div className="text-[9px] text-slate-400 font-semibold px-1">
                          +{dayAppts.length - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected day modal/drawer below calendar */}
          {selectedDayAppointments && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-teal-200 dark:border-teal-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4 text-teal-600" />
                  Scheduled Appointments ({selectedDayAppointments.length})
                </h3>
                <button
                  onClick={() => setSelectedDayAppointments(null)}
                  className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {selectedDayAppointments.map((appt) => (
                  <div
                    key={appt.id}
                    className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <Link
                        href={`/patients/${appt.patient.id}`}
                        className="font-bold text-slate-900 dark:text-white hover:text-teal-600"
                      >
                        {appt.patient.firstName} {appt.patient.lastName}
                      </Link>
                      <span className="font-mono text-teal-600 dark:text-teal-400 font-semibold">
                        {formatApptTime(appt.startsAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500">
                      <MaskedPhone phone={appt.patient.phone} />
                      <span>•</span>
                      <span className="capitalize">{appt.type}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW: Week View */}
      {view === "week" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Week of {startOfWeek.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={prevWeek}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-2.5 py-1 text-xs font-semibold border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                This Week
              </button>
              <button
                onClick={nextWeek}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {weekDays.map((col, idx) => {
              const isToday = col.date.toDateString() === new Date().toDateString();
              return (
                <div
                  key={idx}
                  className={`rounded-xl border p-3 min-h-[220px] flex flex-col space-y-2.5 ${
                    isToday
                      ? "border-teal-500 bg-teal-50/20 dark:bg-teal-950/20"
                      : "border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30"
                  }`}
                >
                  <div className="text-center border-b border-slate-200 dark:border-slate-800 pb-2">
                    <div className="text-[10px] uppercase font-bold text-slate-400">
                      {col.date.toLocaleDateString("en-CA", { weekday: "short" })}
                    </div>
                    <div
                      className={`text-sm font-bold mt-0.5 ${
                        isToday ? "text-teal-600 dark:text-teal-400 font-extrabold" : "text-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {col.date.getDate()}
                    </div>
                  </div>

                  <div className="space-y-2 flex-1">
                    {col.appts.length === 0 ? (
                      <div className="text-[11px] text-slate-400 text-center py-6 italic">
                        No slots
                      </div>
                    ) : (
                      col.appts.map((a) => (
                        <div
                          key={a.id}
                          className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1 shadow-2xs"
                        >
                          <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {a.patient.firstName} {a.patient.lastName}
                          </div>
                          <div className="text-[11px] font-mono text-teal-600 dark:text-teal-400">
                            {formatApptTime(a.startsAt)}
                          </div>
                          <div className="text-[10px] text-slate-400 capitalize">
                            {a.type}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW: List View */}
      {view === "list" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">
                  <th className="py-3.5 px-4">Date & Time</th>
                  <th className="py-3.5 px-4">Patient</th>
                  <th className="py-3.5 px-4">Phone</th>
                  <th className="py-3.5 px-4">Session Type</th>
                  <th className="py-3.5 px-4">Billing</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Origin Call</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                {filteredAppointments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                      No appointments match your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredAppointments.map((appt) => (
                    <tr
                      key={appt.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {formatApptDateTime(appt.startsAt)}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <Link
                          href={`/patients/${appt.patient.id}`}
                          className="font-semibold text-slate-900 dark:text-white hover:text-teal-600 transition-colors"
                        >
                          {appt.patient.firstName} {appt.patient.lastName}
                        </Link>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <MaskedPhone phone={appt.patient.phone} />
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap text-xs capitalize text-slate-600 dark:text-slate-300">
                        {appt.type} Assessment
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-500">
                        {appt.insuranceDirectBilling ? (
                          <span className="text-teal-600 dark:text-teal-400 font-medium">
                            Direct Billing
                          </span>
                        ) : (
                          "Self-pay"
                        )}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full ${
                            appt.status === "completed"
                              ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                              : appt.status === "booked"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                              : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-800"
                          }`}
                        >
                          {appt.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap text-right">
                        {appt.callId ? (
                          <Link
                            href={`/calls/${appt.callId}`}
                            className="inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:underline"
                          >
                            <PhoneCall className="w-3 h-3" />
                            <span>View Call</span>
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-400 italic">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
