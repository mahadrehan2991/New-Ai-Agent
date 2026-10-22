"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface DailyCallData {
  date: string;
  calls: number;
  bookings: number;
}

interface OutcomeData {
  name: string;
  value: number;
  color: string;
}

interface HourlyData {
  hour: string;
  calls: number;
}

interface BodyAreaData {
  area: string;
  count: number;
}

interface OverviewChartsProps {
  dailyCalls: DailyCallData[];
  outcomes: OutcomeData[];
  hourlyCalls: HourlyData[];
  topBodyAreas: BodyAreaData[];
}

export function OverviewCharts({
  dailyCalls,
  outcomes,
  hourlyCalls,
  topBodyAreas,
}: OverviewChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 1. Calls & Bookings Per Day (Last 30 Days) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Call Volume (Last 30 Days)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Daily inbound calls and booked appointments
            </p>
          </div>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyCalls} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="callGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0d9488" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#0d9488" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="bookGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  borderColor: "#334155",
                  borderRadius: "8px",
                  color: "#f8fafc",
                  fontSize: "12px",
                }}
              />
              <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: "11px", paddingBottom: "10px" }} />
              <Area type="monotone" dataKey="calls" name="Total Calls" stroke="#0d9488" strokeWidth={2} fillOpacity={1} fill="url(#callGradient)" />
              <Area type="monotone" dataKey="bookings" name="Booked Slots" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#bookGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. Outcome Breakdown (Donut Chart) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="mb-4">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
            Call Outcomes Breakdown
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Proportion of booked, lookups, and unbooked inquiries
          </p>
        </div>
        <div className="h-64 w-full flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={outcomes}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={4}
                dataKey="value"
              >
                {outcomes.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  borderColor: "#334155",
                  borderRadius: "8px",
                  color: "#f8fafc",
                  fontSize: "12px",
                }}
              />
              <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. Hourly Call Distribution */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="mb-4">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
            Calls by Hour of Day
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Peak call intake across clinic operating hours
          </p>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyCalls} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  borderColor: "#334155",
                  borderRadius: "8px",
                  color: "#f8fafc",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="calls" name="Calls" fill="#0d9488" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. Top 5 Body Areas / Pain Complaints */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="mb-4">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
            Top 5 Body Areas Reported
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Most frequent patient pain or stiffness areas
          </p>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={topBodyAreas}
              margin={{ top: 10, right: 20, left: 30, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="area"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                textAnchor="end"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  borderColor: "#334155",
                  borderRadius: "8px",
                  color: "#f8fafc",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="count" name="Patient Mentions" fill="#14b8a6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
