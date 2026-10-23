"use client";

import { useState } from "react";
import { Wrench, ChevronDown, ChevronRight, CheckCircle2, XCircle, Clock } from "lucide-react";

export interface ToolEventItem {
  id: string;
  toolName: string;
  arguments: string;
  result: string;
  durationMs: number;
  success: boolean;
  timestamp: string;
}

export default function CallDetailTools({ tools }: { tools: ToolEventItem[] }) {
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  function toggle(id: string) {
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function formatJson(raw: string) {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }

  if (tools.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        No external tool calls recorded during this conversation.
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Agent Tool Call Timeline ({tools.length})
          </h3>
        </div>
        <span className="text-xs text-slate-400 font-mono">Real-time function executions</span>
      </div>

      <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
        {tools.map((t, idx) => {
          const isOpen = !!openIds[t.id];
          return (
            <div key={t.id} className="relative pl-8">
              {/* Dot icon */}
              <div
                className={`absolute left-2 top-2 -translate-x-1/2 w-4 h-4 rounded-full flex items-center justify-center border-2 bg-white dark:bg-slate-900 ${
                  t.success
                    ? "border-emerald-500 text-emerald-500"
                    : "border-rose-500 text-rose-500"
                }`}
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    t.success ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                />
              </div>

              {/* Card */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-slate-800/30">
                <button
                  type="button"
                  onClick={() => toggle(t.id)}
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                      {t.toolName}
                    </span>
                    {t.success ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-950/70 dark:text-emerald-400 px-1.5 py-0.5 rounded">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Success
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-100 dark:bg-rose-950/70 dark:text-rose-400 px-1.5 py-0.5 rounded">
                        <XCircle className="w-2.5 h-2.5" />
                        Failed
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {t.durationMs}ms
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {new Date(t.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs space-y-3 font-mono">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">
                        Arguments
                      </div>
                      <pre className="p-2.5 bg-slate-100 dark:bg-slate-800/80 rounded-lg text-slate-800 dark:text-slate-200 overflow-x-auto text-[11px] leading-relaxed">
                        {formatJson(t.arguments)}
                      </pre>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">
                        Result
                      </div>
                      <pre className="p-2.5 bg-slate-100 dark:bg-slate-800/80 rounded-lg text-teal-800 dark:text-teal-300 overflow-x-auto text-[11px] leading-relaxed">
                        {formatJson(t.result)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
