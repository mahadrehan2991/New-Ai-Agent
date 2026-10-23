"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Users, Phone, Calendar, Activity, ChevronRight } from "lucide-react";
import MaskedPhone from "@/components/MaskedPhone";

export interface PatientListItem {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  patientType: string;
  firstSeenAt: string;
  totalCalls: number;
  totalAppointments: number;
  latestComplaintArea: string | null;
  latestComplaintSeverity: number | null;
}

export default function PatientsClient({ initialPatients }: { initialPatients: PatientListItem[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const filteredPatients = useMemo(() => {
    return initialPatients.filter((p) => {
      if (typeFilter !== "all" && p.patientType !== typeFilter) return false;
      if (search.trim()) {
        const query = search.toLowerCase();
        const fullName = `${p.firstName} ${p.lastName}`.toLowerCase();
        const matchesName = fullName.includes(query);
        const matchesPhone = p.phone.includes(query);
        const matchesArea = p.latestComplaintArea ? p.latestComplaintArea.toLowerCase().includes(query) : false;
        if (!matchesName && !matchesPhone && !matchesArea) return false;
      }
      return true;
    });
  }, [initialPatients, search, typeFilter]);

  return (
    <div className="space-y-6">
      {/* Search and Filter toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by patient name, phone, or condition..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by patient type"
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-700 dark:text-slate-300 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
          >
            <option value="all">All Patient Types</option>
            <option value="new">New Patients</option>
            <option value="existing">Existing Patients</option>
          </select>

          <span className="text-xs text-slate-400 font-mono px-2">
            {filteredPatients.length} patient{filteredPatients.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {/* Patients Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">
                <th className="py-3.5 px-4">Patient Name</th>
                <th className="py-3.5 px-4">Phone Number</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">First Registered</th>
                <th className="py-3.5 px-4">Latest Complaint</th>
                <th className="py-3.5 px-4 text-center">Calls</th>
                <th className="py-3.5 px-4 text-center">Bookings</th>
                <th className="py-3.5 px-4 text-right">View Profile</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
              {filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 text-sm">
                    No patients match your search.
                  </td>
                </tr>
              ) : (
                filteredPatients.map((patient) => (
                  <tr
                    key={patient.id}
                    onClick={() => router.push(`/patients/${patient.id}`)}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition-colors group"
                  >
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {patient.firstName} {patient.lastName}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <MaskedPhone phone={patient.phone} />
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                          patient.patientType === "new"
                            ? "bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400 border border-teal-200 dark:border-teal-800"
                            : "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                        }`}
                      >
                        {patient.patientType}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                      {new Date(patient.firstSeenAt).toLocaleDateString("en-CA", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {patient.latestComplaintArea ? (
                        <div className="flex items-center gap-1.5 text-xs capitalize text-slate-700 dark:text-slate-300">
                          <Activity className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                          <span>{patient.latestComplaintArea}</span>
                          {patient.latestComplaintSeverity && (
                            <span className="text-[10px] font-mono text-slate-400">
                              (Sev: {patient.latestComplaintSeverity}/5)
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">None recorded</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap text-center text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">
                      {patient.totalCalls}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap text-center text-xs font-mono font-semibold text-teal-700 dark:text-teal-400">
                      {patient.totalAppointments}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap text-right">
                      <span className="inline-flex p-1 rounded-lg text-slate-400 group-hover:text-teal-600 group-hover:bg-teal-50 dark:group-hover:bg-teal-950/60 transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
