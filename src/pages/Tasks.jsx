import React, { useState, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Brain, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TASK_MESSAGES = [
  "Searching LinkedIn & Glassdoor for real active job postings…",
  "Finding companies currently hiring for your target roles…",
  "Mapping your skill gaps to actionable tasks…",
  "Generating specific course & project recommendations…",
  "Prioritising tasks by impact on Tier 1 applications…",
  "Almost ready — wrapping up your task list…",
];

function GeneratingBanner({ messages }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % messages.length), 3500);
    return () => clearInterval(t);
  }, [messages.length]);
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-start gap-3 mb-6">
      <Loader2 className="w-4 h-4 animate-spin text-amber-600 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-sm font-semibold text-amber-800">Generating your tasks — this takes ~20–40 seconds</p>
        <p className="text-xs text-amber-700 mt-1">{messages[idx]}</p>
      </div>
    </div>
  );
}

const CATEGORY_LABELS = {
  skill: { label: "Skill Gap", color: "bg-blue-50 text-blue-700" },
  project: { label: "Project", color: "bg-purple-50 text-purple-700" },
  networking: { label: "Networking", color: "bg-amber-50 text-amber-700" },
  cv: { label: "CV", color: "bg-rose-50 text-rose-700" },
  application: { label: "Application", color: "bg-emerald-50 text-emerald-700" },
};

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

export default function Tasks() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter] = useState("all");

  const { data: tasks, isLoading: loadingTasks } = useQuery({
    queryKey: ["tasks", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from("tasks").select("*").eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    initialData: [],
  });

  const { data: profiles } = useQuery({
    queryKey: ["userProfile", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    initialData: [],
  });

  const { data: roles } = useQuery({
    queryKey: ["careerRoles", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from("career_roles").select("*").eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    initialData: [],
  });

  const profile = profiles?.[0];

  const handleGenerate = async () => {
    if (!profile) return;
    setGenerating(true);
    try {
      const existingIncomplete = tasks.filter((t) => !t.is_complete);
      
      // Delete old incomplete tasks
      if (existingIncomplete.length > 0) {
        const ids = existingIncomplete.map((t) => t.id);
        await supabase.from("tasks").delete().in("id", ids);
      }

      // Call LLM to generate personalized tasks
      const { data, error } = await supabase.functions.invoke("generate-tasks", {
        body: { context: "weekly action plan" },
      });

      if (error) throw error;

      const generatedTasks = (data?.tasks || []).map((t) => ({
        title: t.title,
        description: t.description,
        category: t.category || "application",
        priority: t.priority || "medium",
        role_title: t.role_title || null,
        is_complete: false,
        user_id: user.id,
      }));

      if (generatedTasks.length > 0) {
        await supabase.from("tasks").insert(generatedTasks);
      }
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (err) {
      console.error("Task generation error:", err);
    } finally {
      setGenerating(false);
    }
  };


  const toggleComplete = async (task) => {
    await supabase.from("tasks").update({ is_complete: !task.is_complete }).eq("id", task.id);
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  const sorted = [...tasks].sort((a, b) => {
    if (a.is_complete !== b.is_complete) return a.is_complete ? 1 : -1;
    return (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
  });

  const filtered = filter === "all" ? sorted : sorted.filter((t) => t.category === filter);
  const completedCount = tasks.filter((t) => t.is_complete).length;

  if (loadingTasks) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="w-5 h-5 animate-spin text-[#A3A3A3]" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0A0A0A]">Tasks</h1>
          <p className="text-sm text-[#A3A3A3] mt-1">
            Assigned from your skill gaps and role requirements. Not invented by you.
          </p>
          {tasks.length > 0 && (
            <p className="text-xs text-[#A3A3A3] mt-1">
              {completedCount} of {tasks.length} completed
            </p>
          )}
        </div>
        {profile && (
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-[#0A0A0A] hover:bg-[#262626] text-sm flex-shrink-0"
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</>
            ) : (
              <><Brain className="w-4 h-4 mr-2" />Generate Tasks</>
            )}
          </Button>
        )}
      </div>

      {generating && <GeneratingBanner messages={TASK_MESSAGES} />}

      {/* Category filters */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {["all", "skill", "project", "networking", "cv", "application"].map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
              filter === cat
                ? "bg-[#0A0A0A] text-white"
                : "bg-white border border-[#E5E5E5] text-[#525252] hover:bg-[#F5F5F5]"
            )}
          >
            {cat === "all" ? "All" : CATEGORY_LABELS[cat]?.label || cat}
          </button>
        ))}
      </div>

      {tasks.length === 0 && (
        <div className="bg-white rounded-xl border border-[#E5E5E5] p-8 text-center">
          <p className="text-sm text-[#525252] mb-1">No tasks assigned yet.</p>
          <p className="text-xs text-[#A3A3A3]">
            {!profile
              ? "Complete your profile first."
              : roles.length === 0
              ? "Generate your Career Roadmap first — tasks are derived from your role gaps."
              : "Click 'Generate Tasks' to assign tasks based on your current skill gaps and Tier 1 roles."}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((task) => {
          const cat = CATEGORY_LABELS[task.category] || CATEGORY_LABELS.skill;
          return (
            <div
              key={task.id}
              className={cn(
                "bg-white rounded-xl border border-[#E5E5E5] px-5 py-4 flex items-start gap-4 transition-opacity",
                task.is_complete && "opacity-50"
              )}
            >
              <button
                onClick={() => toggleComplete(task)}
                className="mt-0.5 flex-shrink-0"
              >
                {task.is_complete ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : (
                  <Circle className="w-5 h-5 text-[#D4D4D4] hover:text-[#A3A3A3] transition-colors" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className={cn("text-sm font-medium text-[#0A0A0A]", task.is_complete && "line-through text-[#A3A3A3]")}>
                    {task.title}
                  </p>
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-md", cat.color)}>
                    {cat.label}
                  </span>
                  {task.priority === "high" && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-red-50 text-red-600">
                      High Priority
                    </span>
                  )}
                </div>
                {task.description && (
                  <p className="text-xs text-[#525252] leading-relaxed">{task.description}</p>
                )}
                {(task.role_title || task.skill_gap) && (
                  <p className="text-[11px] text-[#A3A3A3] mt-1">
                    {task.role_title && `For: ${task.role_title}`}
                    {task.role_title && task.skill_gap && " · "}
                    {task.skill_gap && `Gap: ${task.skill_gap}`}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}