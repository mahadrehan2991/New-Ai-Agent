"use client";

import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PhoneCall,
  Users,
  AlertTriangle,
  Calendar,
  Settings,
  HeartPulse,
  Activity,
  ClipboardList,
} from "lucide-react";

const SECTIONS = [
  {
    title: "Clinical Intake",
    items: [
      { name: "Overview", href: "/", icon: LayoutDashboard },
      { name: "Call Records", href: "/calls", icon: PhoneCall },
      { name: "Patient Directory", href: "/patients", icon: Users },
    ],
  },
  {
    title: "Practice Workflow",
    items: [
      { name: "Appointments", href: "/appointments", icon: Calendar },
      { name: "Follow-Up Queue", href: "/recurring-issues", icon: AlertTriangle },
      { name: "Clinic Settings", href: "/settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-50/70 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 min-h-screen">
      {/* Clinic Practice Header */}
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-700 to-teal-900 flex items-center justify-center text-white shadow-sm ring-1 ring-black/5">
            <HeartPulse className="w-5 h-5 text-teal-200" />
          </div>
          <div>
            <h2 className="font-bold text-sm text-slate-900 dark:text-white leading-tight tracking-tight">
              Happy Harmony
            </h2>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Physio & Spine Clinic
            </p>
          </div>
        </div>

        <div className="mt-3.5 flex items-center justify-between px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-lg text-[11px]">
          <span className="font-semibold text-slate-600 dark:text-slate-300">
            Receptionist: Hannah
          </span>
          <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Ready
          </span>
        </div>
      </div>

      {/* Navigation Sections */}
      <nav className="p-3 space-y-5 flex-1">
        {SECTIONS.map((sec) => (
          <div key={sec.title} className="space-y-1">
            <div className="px-3 text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
              {sec.title}
            </div>
            {sec.items.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <a
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-teal-700 text-white font-semibold shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${
                      isActive ? "text-teal-100" : "text-slate-400 dark:text-slate-500"
                    }`}
                  />
                  <span>{item.name}</span>
                </a>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Clinic Operating Info Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
        <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
          <Activity className="w-3.5 h-3.5 text-teal-600" />
          <span>Outpatient Rehabilitation</span>
        </div>
        <p className="text-[10px] text-slate-400">London, ON • (519) 555-0199</p>
      </div>
    </aside>
  );
}
