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
        <div className="flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Reception Desk Active
          </span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-teal-600" />
            <span>London, ON (EST)</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Staff User */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 text-xs">
          <div className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-[10px]">
            HH
          </div>
          <span className="font-semibold text-slate-700 dark:text-slate-200 text-xs">
            Reception Staff
          </span>
        </div>
      </div>
    </header>
  );
}
