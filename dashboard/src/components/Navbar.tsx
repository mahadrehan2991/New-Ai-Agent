"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Phone, ShieldCheck, Clock, Loader2 } from "lucide-react";

export function Navbar() {
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Clock className="w-3.5 h-3.5 text-teal-600" />
          <span>Clinic Time: <strong className="text-slate-700 dark:text-slate-200">America/Toronto (EST)</strong></span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Status indicator */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-full text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          <Phone className="w-3 h-3 text-emerald-600 animate-pulse" />
          <span>Deepgram Voice Active</span>
        </div>

        {/* Staff User */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-700 text-xs">
          <div className="w-7 h-7 rounded-full bg-teal-100 dark:bg-teal-900 flex items-center justify-center text-teal-700 dark:text-teal-300 font-semibold text-[11px]">
            SA
          </div>
          <span className="font-semibold text-slate-700 dark:text-slate-300 hidden md:inline">
            Clinic Staff
          </span>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          title="Sign out of clinic dashboard"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
        >
          {loggingOut ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <LogOut className="w-3.5 h-3.5" />
          )}
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
}
