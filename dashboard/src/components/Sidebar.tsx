"use client";

import Link from "next/navigation";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PhoneCall,
  Users,
  AlertTriangle,
  Calendar,
  Settings,
  Sparkles,
  HeartPulse,
} from "lucide-react";

const NAV_ITEMS = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "Call Logs", href: "/calls", icon: PhoneCall },
  { name: "Patients", href: "/patients", icon: Users },
  { name: "Recurring Issues", href: "/recurring", icon: AlertTriangle },
  { name: "Appointments", href: "/appointments", icon: Calendar },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 min-h-screen">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-teal-600/30">
            <HeartPulse className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
              Happy Harmony
            </h2>
            <p className="text-[11px] font-medium text-teal-600 dark:text-teal-400">
              Physio & Spine Clinic
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 px-2.5 py-1.5 bg-teal-50 dark:bg-teal-950/50 border border-teal-200/60 dark:border-teal-900/60 rounded-lg">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
          </span>
          <span className="text-xs font-semibold text-teal-800 dark:text-teal-300">
            Hannah AI Receptionist
          </span>
          <Sparkles className="w-3 h-3 text-teal-600 dark:text-teal-400 ml-auto" />
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="p-3 space-y-1 flex-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <a
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? "bg-teal-600 text-white shadow-sm shadow-teal-600/30"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-400"}`} />
              <span>{item.name}</span>
            </a>
          );
        })}
      </nav>

      {/* Clinic Hours Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500 space-y-1">
        <p className="font-semibold text-slate-600 dark:text-slate-400">London, Ontario (EST)</p>
        <p>Mon–Fri: 10 AM – 6 PM</p>
        <p>Saturday: 10 AM – 2 PM</p>
      </div>
    </aside>
  );
}
