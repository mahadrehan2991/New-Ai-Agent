"use client";

import { useState } from "react";
import {
  Settings,
  Clock,
  Key,
  Copy,
  Check,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  Shield,
  Building,
  Radio,
  FileCode,
} from "lucide-react";

export default function SettingsClient({ webhookSecret }: { webhookSecret: string }) {
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: number;
    message: string;
    durationMs: number;
  } | null>(null);

  function copySecret() {
    navigator.clipboard.writeText(webhookSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleTestWebhook() {
    setTesting(true);
    setTestResult(null);
    const start = performance.now();

    try {
      const res = await fetch("/api/webhooks/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${webhookSecret}`,
        },
        body: JSON.stringify({
          eventType: "ping",
          timestamp: new Date().toISOString(),
          source: "Hannah Voice Agent Simulator",
        }),
      });

      const data = await res.json();
      const durationMs = Math.round(performance.now() - start);

      setTestResult({
        status: res.status,
        message: data.message || (res.ok ? "Webhook received successfully!" : "Failed to verify webhook"),
        durationMs,
      });
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      setTestResult({
        status: 500,
        message: "Network error connecting to webhook endpoint.",
        durationMs,
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Clinic Operating Hours */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5 text-teal-600 dark:text-teal-400">
          <Clock className="w-5 h-5" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Clinic Operating Hours
          </h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Justine AI voice agent uses these clinic operational hours to validate patient appointment bookings and after-hours call triage.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="font-semibold text-slate-800 dark:text-slate-200">Monday &ndash; Friday</span>
            <span className="font-mono text-teal-600 dark:text-teal-400 font-bold">8:00 AM &ndash; 6:00 PM EST</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="font-semibold text-slate-800 dark:text-slate-200">Saturday</span>
            <span className="font-mono text-teal-600 dark:text-teal-400 font-bold">9:00 AM &ndash; 2:00 PM EST</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="font-semibold text-slate-800 dark:text-slate-200">Sunday</span>
            <span className="font-mono text-rose-500 font-bold">Closed (Emergency voicemail triage)</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="font-semibold text-slate-800 dark:text-slate-200">Clinic Timezone</span>
            <span className="font-mono text-slate-600 dark:text-slate-300 font-bold">America/Toronto (EST/EDT)</span>
          </div>
        </div>
      </div>

      {/* Webhook Secret & Agent Ingestion */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-teal-600 dark:text-teal-400">
            <Key className="w-5 h-5" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Webhook Secret & Ingestion Authentication
            </h2>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 font-semibold">
            Bearer Token Auth
          </span>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          The voice agent passes this secret in the <code className="font-mono text-teal-600 bg-teal-50 dark:bg-teal-950/60 px-1 py-0.5 rounded">Authorization: Bearer &lt;SECRET&gt;</code> header on all call ingestion webhooks.
        </p>

        {/* Secret box */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Current Secret Key
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 p-2.5 bg-slate-100 dark:bg-slate-800 font-mono text-xs text-slate-800 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 select-all overflow-x-auto">
              {webhookSecret}
            </div>
            <button
              onClick={copySecret}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer shrink-0"
              title="Copy secret"
            >
              {copied ? <Check className="w-4 h-4 text-teal-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Ingestion endpoints reference */}
        <div className="space-y-2 pt-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Configured Ingestion Endpoints
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
            {[
              { method: "POST", path: "/api/webhooks/call-started", desc: "Initialize call session" },
              { method: "POST", path: "/api/webhooks/transcript", desc: "Append user/agent turns" },
              { method: "POST", path: "/api/webhooks/tool-event", desc: "Log function executions" },
              { method: "POST", path: "/api/webhooks/call-ended", desc: "Finalize & run AI enrichment" },
            ].map((ep) => (
              <div
                key={ep.path}
                className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-1"
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-teal-600 dark:text-teal-400">{ep.method}</span>
                  <span className="text-slate-800 dark:text-slate-200 truncate">{ep.path}</span>
                </div>
                <div className="text-[11px] text-slate-400 font-sans">{ep.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Test Webhook Action */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-slate-500">
            Send an authorized test payload to verify endpoint connectivity and HMAC Bearer verification.
          </div>

          <button
            onClick={handleTestWebhook}
            disabled={testing}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer shrink-0 transition-colors"
          >
            {testing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Testing Webhook...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Test Webhook Ping</span>
              </>
            )}
          </button>
        </div>

        {/* Test result output */}
        {testResult && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
              testResult.status === 200
                ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
                : "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {testResult.status === 200 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
            <span className="font-mono text-[11px] opacity-75 shrink-0">
              HTTP {testResult.status} • {testResult.durationMs}ms
            </span>
          </div>
        )}
      </div>

      {/* Clinic Details */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400">
          <Building className="w-4 h-4" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Clinic Facility Information
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-300">
          <div>
            <span className="font-semibold text-slate-900 dark:text-white block">Facility:</span>
            Happy Harmony Physiotherapy & Spine Rehabilitation Clinic
          </div>
          <div>
            <span className="font-semibold text-slate-900 dark:text-white block">Location:</span>
            London, Ontario, Canada
          </div>
          <div>
            <span className="font-semibold text-slate-900 dark:text-white block">AI Receptionist:</span>
            Justine (Deepgram Voice Agent API)
          </div>
          <div>
            <span className="font-semibold text-slate-900 dark:text-white block">Telephony Carrier:</span>
            Twilio Voice SIP Media Streams
          </div>
        </div>
      </div>
    </div>
  );
}
