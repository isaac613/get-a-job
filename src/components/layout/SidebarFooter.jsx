import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

export default function SidebarFooter() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const initials = user?.full_name
    ? user.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <div className="px-4 py-4 border-t border-[#F0F0F0]">
      {user ? (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center flex-shrink-0">
            <span className="text-[11px] font-bold text-white">{initials}</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#0A0A0A] truncate">{user.full_name}</p>
            <p className="text-[10px] text-[#A3A3A3] truncate">{user.email}</p>
          </div>
        </div>
      ) : (
        <p className="text-[10px] text-[#A3A3A3] tracking-wide uppercase text-center">
          Employability through reasoning
        </p>
      )}
    </div>
  );
}