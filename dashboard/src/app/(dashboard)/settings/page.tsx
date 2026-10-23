import SettingsClient from "@/components/SettingsClient";
import { Settings } from "lucide-react";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const secret = process.env.WEBHOOK_SECRET || "whsec_harmony_secret_key_london";

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-600/10 dark:bg-teal-400/10 flex items-center justify-center text-teal-600 dark:text-teal-400">
            <Settings className="w-4 h-4" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Clinic & Webhook Settings
          </h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Operating schedules, telemetry webhook secrets, and endpoint connectivity diagnostics for Hannah Voice Agent.
        </p>
      </div>

      <SettingsClient webhookSecret={secret} />
    </div>
  );
}
