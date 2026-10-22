"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { maskPhone } from "@/lib/utils";

export function MaskedPhone({ phone }: { phone: string }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
      <span>{maskPhone(phone, revealed)}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setRevealed(!revealed);
        }}
        title={revealed ? "Mask phone number" : "Reveal phone number"}
        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
      >
        {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
    </span>
  );
}
