"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface BodyAreaStat {
  area: string;
  count: number;
  highSeverityCount: number;
}

export default function RecurringCharts({ data }: { data: BodyAreaStat[] }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Clinic-Wide Symptom Distribution
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Total reported complaint frequencies vs high-severity cases (Severity 4–5)
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-teal-500" />
            <span className="text-slate-600 dark:text-slate-300">Total Cases</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-rose-500" />
            <span className="text-slate-600 dark:text-slate-300">High Severity</span>
          </div>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
            <XAxis
              dataKey="area"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "#64748b" }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "#64748b" }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "none",
                borderRadius: "12px",
                fontSize: "12px",
                color: "#f8fafc",
              }}
            />
            <Bar dataKey="count" fill="#0d9488" radius={[6, 6, 0, 0]} name="Total Mentions" />
            <Bar dataKey="highSeverityCount" fill="#f43f5e" radius={[6, 6, 0, 0]} name="Severity 4-5" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
