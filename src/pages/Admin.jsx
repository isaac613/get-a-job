import React, { useState, useMemo } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Loader2, AlertTriangle, Activity, DollarSign, Users, AlertCircle } from "lucide-react";
import { format } from "date-fns";

// Admin dashboard — Wk 2 Day 5. Five cards over real-time observability:
//   1. Cost & call-volume trend (toggleable 7/14/30 day window)
//   2. Per-function volume bar chart (last 7d fixed)
//   3. Conversion funnel (Signed up → 1+ Offer)
//   4. Color-coded error feed (latest 20 failures)
//   5. Per-student engagement table
//
// Defense-in-depth gating:
//   - SQL gate: admin_users table + is_admin() helper + RLS policies on
//     every data table the dashboard reads from. Each admin_* RPC also
//     RAISES if caller isn't admin.
//   - Frontend gate (this file): render NotFound-style placeholder if
//     is_admin() returns false. UI doesn't leak the route's existence.

const TREND_WINDOWS = [
  { value: 7, label: "7d" },
  { value: 14, label: "14d" },
  { value: 30, label: "30d" },
];

// Color-coded error palette by error_code prefix. Matches the existing
// error taxonomy from PR #6 + extends as needed.
const ERROR_COLORS = {
  auth: "bg-amber-50 border-amber-200 text-amber-800",
  rate_limit: "bg-blue-50 border-blue-200 text-blue-800",
  payload_too_large: "bg-blue-50 border-blue-200 text-blue-800",
  bad_input: "bg-blue-50 border-blue-200 text-blue-800",
  missing_input: "bg-blue-50 border-blue-200 text-blue-800",
  bad_json: "bg-blue-50 border-blue-200 text-blue-800",
  bad_ownership: "bg-blue-50 border-blue-200 text-blue-800",
  json_parse: "bg-orange-50 border-orange-200 text-orange-800",
  bad_shape: "bg-orange-50 border-orange-200 text-orange-800",
  truncated: "bg-orange-50 border-orange-200 text-orange-800",
  truncated_after_retry: "bg-orange-50 border-orange-200 text-orange-800",
  no_openai_key: "bg-red-50 border-red-200 text-red-800",
  unhandled: "bg-red-100 border-red-300 text-red-900",
};
const errorChip = (code) => {
  if (!code) return "bg-gray-50 border-gray-200 text-gray-700";
  if (ERROR_COLORS[code]) return ERROR_COLORS[code];
  // openai_<status>, openai_retry_<status> — bucket by family
  if (code.startsWith("openai_")) return "bg-red-50 border-red-200 text-red-800";
  return "bg-gray-50 border-gray-200 text-gray-700";
};

// Funnel bar colors — gradient amber-to-rose to visually convey drop-off
const FUNNEL_COLORS = ["#10b981", "#34d399", "#fbbf24", "#fb923c", "#ef4444"];

function Card({ title, icon: Icon, footer, children }) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E5E5] p-5">
      <div className="flex items-center gap-2 mb-4">
        {Icon && <Icon className="w-4 h-4 text-[#525252]" />}
        <h2 className="text-sm font-semibold text-[#0A0A0A] tracking-tight">{title}</h2>
      </div>
      <div>{children}</div>
      {footer && <div className="mt-3 pt-3 border-t border-[#F5F5F5] text-[11px] text-[#A3A3A3]">{footer}</div>}
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex items-center justify-center h-40 text-xs text-[#A3A3A3]">
      {message}
    </div>
  );
}

function TrendCard() {
  const [days, setDays] = useState(7);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin_cost_trend", days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_cost_trend", { p_days: days });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60_000,
  });

  const chartData = useMemo(() => {
    return (data || []).map((d) => ({
      day: format(new Date(d.day), "MMM d"),
      cost: Number(d.total_cost),
      calls: Number(d.total_calls),
      failures: Number(d.total_failures),
    }));
  }, [data]);

  const totalCost = chartData.reduce((acc, d) => acc + d.cost, 0);
  const totalCalls = chartData.reduce((acc, d) => acc + d.calls, 0);

  return (
    <Card
      title="Cost & call volume"
      icon={DollarSign}
      footer={`Window: last ${days} days · ${chartData.length} bucket(s) · $${totalCost.toFixed(4)} total · ${totalCalls} calls`}
    >
      <div className="flex justify-end gap-1 mb-3">
        {TREND_WINDOWS.map((w) => (
          <button
            key={w.value}
            onClick={() => setDays(w.value)}
            className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
              days === w.value
                ? "bg-[#0A0A0A] text-white"
                : "bg-white border border-[#E5E5E5] text-[#525252] hover:bg-[#F5F5F5]"
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-4 h-4 animate-spin text-[#A3A3A3]" /></div>
      ) : error ? (
        <EmptyState message={`Error loading trend: ${error.message}`} />
      ) : chartData.length === 0 ? (
        <EmptyState message="No data in this window yet." />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F5" />
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#525252" }} />
            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#525252" }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#525252" }} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #E5E5E5" }}
              formatter={(v, name) => name === "cost" ? `$${Number(v).toFixed(4)}` : v}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="left" type="monotone" dataKey="calls" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="calls" />
            <Line yAxisId="right" type="monotone" dataKey="cost" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="cost ($)" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

function VolumeCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin_function_volume"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_function_volume");
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60_000,
  });

  const chartData = useMemo(() => {
    return (data || []).map((d) => ({
      name: d.function_name.replace(/^generate-/, "g-").replace(/^extract-/, "e-"),
      fullName: d.function_name,
      calls: Number(d.calls),
      failures: Number(d.failures),
      successes: Number(d.calls) - Number(d.failures),
      cost: Number(d.total_cost),
      avgLatency: Math.round(Number(d.avg_latency_ms)),
    }));
  }, [data]);

  return (
    <Card
      title="Per-function volume (7d)"
      icon={Activity}
      footer={`${chartData.length} function(s) · ${chartData.reduce((a, d) => a + d.calls, 0)} total calls · ${chartData.reduce((a, d) => a + d.failures, 0)} failures`}
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-4 h-4 animate-spin text-[#A3A3A3]" /></div>
      ) : error ? (
        <EmptyState message={`Error loading volume: ${error.message}`} />
      ) : chartData.length === 0 ? (
        <EmptyState message="No function calls in the last 7 days." />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F5" />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#525252" }} interval={0} angle={-15} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 10, fill: "#525252" }} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #E5E5E5" }}
              labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
              formatter={(v, name, p) => {
                if (name === "successes") return [`${v} (avg ${p.payload.avgLatency}ms)`, "successes"];
                return v;
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="successes" stackId="a" fill="#10b981" name="successes" />
            <Bar dataKey="failures" stackId="a" fill="#ef4444" name="failures" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

function FunnelCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin_funnel"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_funnel");
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60_000,
  });

  // Compute drop-off % vs. previous stage; first stage is 100%.
  const funnelRows = useMemo(() => {
    if (!data || data.length === 0) return [];
    const top = Number(data[0].count) || 1;
    return data.map((row, i) => {
      const count = Number(row.count);
      const prev = i === 0 ? count : Number(data[i - 1].count);
      const dropPct = i === 0 ? 0 : prev === 0 ? 0 : Math.round(((prev - count) / prev) * 100);
      const widthPct = top === 0 ? 0 : Math.round((count / top) * 100);
      return { stage: row.stage, count, dropPct, widthPct, color: FUNNEL_COLORS[i] || "#737373" };
    });
  }, [data]);

  return (
    <Card
      title="Conversion funnel"
      icon={Users}
      footer={funnelRows.length === 0 ? "No data yet" : `Top: ${funnelRows[0].count} signups · Bottom: ${funnelRows[funnelRows.length - 1].count} offers`}
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-4 h-4 animate-spin text-[#A3A3A3]" /></div>
      ) : error ? (
        <EmptyState message={`Error loading funnel: ${error.message}`} />
      ) : funnelRows.length === 0 ? (
        <EmptyState message="No cohort data yet." />
      ) : (
        <div className="space-y-2">
          {funnelRows.map((row, i) => (
            <div key={row.stage}>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-medium text-[#0A0A0A]">{row.stage}</span>
                <span className="text-[#525252]">
                  <strong>{row.count}</strong>
                  {i > 0 && row.dropPct > 0 && (
                    <span className="text-[#A3A3A3] ml-2">−{row.dropPct}% from prev</span>
                  )}
                </span>
              </div>
              <div className="h-6 bg-[#FAFAFA] rounded">
                <div
                  className="h-6 rounded transition-all"
                  style={{ width: `${row.widthPct}%`, backgroundColor: row.color }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ErrorFeedCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin_error_feed"],
    queryFn: async () => {
      // Direct query; RLS gates to admin via the function_metrics admin policy
      const { data, error } = await supabase
        .from("function_metrics")
        .select("id, function_name, error_code, http_status, latency_ms, user_id, created_at")
        .eq("ok", false)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30_000,
  });

  return (
    <Card
      title="Recent failures"
      icon={AlertCircle}
      footer={`Latest 20 ok=false rows · refreshes every 30s · ${(data || []).length} shown`}
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-4 h-4 animate-spin text-[#A3A3A3]" /></div>
      ) : error ? (
        <EmptyState message={`Error loading feed: ${error.message}`} />
      ) : (data || []).length === 0 ? (
        <EmptyState message="No failures recorded. 🎉" />
      ) : (
        <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
          {data.map((r) => (
            <div
              key={r.id}
              className={`px-3 py-2 rounded border text-[11px] ${errorChip(r.error_code)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="font-semibold">{r.function_name}</span>
                  <span className="opacity-70 ml-2">{r.error_code || "(no code)"}</span>
                  <span className="opacity-50 ml-2">→ HTTP {r.http_status}</span>
                </div>
                <div className="opacity-60 flex-shrink-0 text-[10px]">
                  {format(new Date(r.created_at), "MMM d HH:mm:ss")} · {r.latency_ms}ms
                </div>
              </div>
              {r.user_id && (
                <div className="opacity-50 text-[10px] mt-0.5 truncate">user_id: {r.user_id.slice(0, 8)}…</div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function EngagementCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin_student_engagement"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_student_engagement");
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60_000,
  });

  return (
    <Card
      title="Student engagement"
      icon={Users}
      footer={`${(data || []).length} student(s) total`}
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-4 h-4 animate-spin text-[#A3A3A3]" /></div>
      ) : error ? (
        <EmptyState message={`Error loading engagement: ${error.message}`} />
      ) : (data || []).length === 0 ? (
        <EmptyState message="No students yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-[#A3A3A3] border-b border-[#F5F5F5]">
                <th className="py-2 pr-3 font-medium">Student</th>
                <th className="py-2 pr-3 font-medium">Onboarded</th>
                <th className="py-2 pr-3 font-medium text-right">Apps</th>
                <th className="py-2 pr-3 font-medium text-right">Apps 7d</th>
                <th className="py-2 pr-3 font-medium text-right">Stories</th>
                <th className="py-2 pr-3 font-medium text-right">Calls 7d</th>
                <th className="py-2 pr-3 font-medium text-right">Cost</th>
                <th className="py-2 font-medium">Last app</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.user_id} className="border-b border-[#FAFAFA]">
                  <td className="py-2 pr-3 truncate max-w-[140px]" title={r.user_id}>
                    {r.full_name || "(no name)"}
                  </td>
                  <td className="py-2 pr-3">
                    {r.onboarding_complete ? (
                      <span className="text-emerald-700">✓</span>
                    ) : (
                      <span className="text-[#A3A3A3]">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">{r.total_applications}</td>
                  <td className="py-2 pr-3 text-right">
                    {r.applications_7d > 0 ? <span className="font-semibold text-emerald-700">{r.applications_7d}</span> : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right">{r.total_stories}</td>
                  <td className="py-2 pr-3 text-right">{r.function_calls_7d}</td>
                  <td className="py-2 pr-3 text-right">${Number(r.total_cost_usd).toFixed(4)}</td>
                  <td className="py-2 text-[#525252]">
                    {r.last_application_at ? format(new Date(r.last_application_at), "MMM d") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function Admin() {
  const { user } = useAuth();

  // Frontend gate — defense in depth (the SQL gate is the actual security
  // boundary; this just keeps non-admins from seeing the page chrome).
  const { data: isAdmin, isLoading: checkingAdmin } = useQuery({
    queryKey: ["is_admin", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_admin");
      if (error) throw error;
      return Boolean(data);
    },
    enabled: !!user?.id,
  });

  if (checkingAdmin) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="w-5 h-5 animate-spin text-[#A3A3A3]" />
      </div>
    );
  }

  if (!isAdmin) {
    // 404-style — don't acknowledge the route exists
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-2">
        <AlertTriangle className="w-8 h-8 text-[#A3A3A3]" />
        <p className="text-sm font-medium text-[#525252]">Page not found</p>
        <p className="text-xs text-[#A3A3A3]">The page you're looking for doesn't exist.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-[#0A0A0A]">Admin Dashboard</h1>
        <p className="text-sm text-[#A3A3A3] mt-1">
          Real-time observability over the platform. Auto-refreshes every 30–60s.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <TrendCard />
        <VolumeCard />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <FunnelCard />
        <ErrorFeedCard />
      </div>

      <div className="grid grid-cols-1 gap-4">
        <EngagementCard />
      </div>
    </div>
  );
}
