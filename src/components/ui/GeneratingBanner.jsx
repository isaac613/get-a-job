import React, { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function GeneratingBanner({ messages, subtitle }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % messages.length), 3500);
    return () => clearInterval(t);
  }, [messages]);
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-start gap-3 mb-6">
      <Loader2 className="w-4 h-4 animate-spin text-amber-600 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-sm font-semibold text-amber-800">{subtitle}</p>
        <p className="text-xs text-amber-700 mt-1 transition-all">{messages[idx]}</p>
      </div>
    </div>
  );
}
