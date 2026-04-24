import React, { useMemo, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Plus,
  Clock,
  MapPin,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CheckSquare,
  CalendarDays,
  ArrowRight,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  parseISO,
  compareAsc,
} from "date-fns";
import AddEventDialog from "../components/calendar/AddEventDialog";
import { cn } from "@/lib/utils";

// Normalized item palette. Each item = { id, kind, title, subtitle?, date (Date),
// allDay, startISO?, endISO?, route, dotClass, chipClass, icon, meta }.
const EVENT_TYPE_CHIPS = {
  interview: "bg-red-100 border-red-300 text-red-800",
  application_deadline: "bg-amber-100 border-amber-300 text-amber-800",
  networking_event: "bg-blue-100 border-blue-300 text-blue-800",
  task_deadline: "bg-purple-100 border-purple-300 text-purple-800",
  follow_up: "bg-green-100 border-green-300 text-green-800",
};
const EVENT_TYPE_DOTS = {
  interview: "bg-red-500",
  application_deadline: "bg-amber-500",
  networking_event: "bg-blue-500",
  task_deadline: "bg-purple-500",
  follow_up: "bg-green-500",
};
const EVENT_TYPE_LABELS = {
  interview: "Interview",
  application_deadline: "Application Deadline",
  networking_event: "Networking",
  task_deadline: "Task Deadline",
  follow_up: "Follow Up",
};

const TASK_PRIORITY_CHIPS = {
  high: "bg-red-50 border-red-200 text-red-800",
  medium: "bg-amber-50 border-amber-200 text-amber-800",
  low: "bg-emerald-50 border-emerald-200 text-emerald-800",
};
const TASK_PRIORITY_DOTS = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
};

const APP_APPLIED_CHIP = "bg-indigo-50 border-indigo-200 text-indigo-800";
const APP_APPLIED_DOT = "bg-indigo-500";

const VIEW_MODES = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "day", label: "Day" },
];

function safeParseDate(value) {
  if (!value) return null;
  try {
    const d = typeof value === "string" ? parseISO(value) : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export default function Calendar() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cursor, setCursor] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState("month");
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: events = [], isLoading: loadingEvents, isError: eventsError } = useQuery({
    queryKey: ["calendarEvents", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const { data: applications = [], isLoading: loadingApps } = useQuery({
    queryKey: ["applications", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("applications")
        .select("*")
        .eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const { data: tasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ["tasks", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Normalize all three sources into a single dated-item list.
  const items = useMemo(() => {
    const out = [];

    for (const event of events) {
      const date = safeParseDate(event.start_date);
      if (!date) continue;
      out.push({
        id: `event-${event.id}`,
        kind: "event",
        title: event.title || "Untitled event",
        subtitle: EVENT_TYPE_LABELS[event.event_type] || "Event",
        date,
        allDay: !!event.all_day,
        startISO: event.start_date,
        endISO: event.end_date,
        location: event.location,
        description: event.description,
        dotClass: EVENT_TYPE_DOTS[event.event_type] || "bg-gray-400",
        chipClass: EVENT_TYPE_CHIPS[event.event_type] || "bg-gray-50 border-gray-200 text-gray-700",
        route: event.application_id ? "/Tracker" : "/Calendar",
        rawApplicationId: event.application_id,
      });
    }

    for (const task of tasks) {
      if (!task.due_date) continue;
      const date = safeParseDate(task.due_date);
      if (!date) continue;
      const priority = task.priority || "medium";
      out.push({
        id: `task-${task.id}`,
        kind: "task",
        title: task.title || "Untitled task",
        subtitle: `Task · ${priority}${task.is_complete ? " · done" : ""}`,
        date,
        allDay: true,
        completed: !!task.is_complete,
        priority,
        description: task.description,
        dotClass: TASK_PRIORITY_DOTS[priority] || "bg-gray-400",
        chipClass: TASK_PRIORITY_CHIPS[priority] || "bg-gray-50 border-gray-200 text-gray-700",
        route: "/Tasks",
      });
    }

    for (const app of applications) {
      if (!app.applied_date) continue;
      const date = safeParseDate(app.applied_date);
      if (!date) continue;
      out.push({
        id: `app-${app.id}`,
        kind: "application",
        title: app.role_title || "Application",
        subtitle: app.company ? `Applied · ${app.company}` : "Applied",
        date,
        allDay: true,
        dotClass: APP_APPLIED_DOT,
        chipClass: APP_APPLIED_CHIP,
        route: "/Tracker",
      });
    }

    return out;
  }, [events, tasks, applications]);

  const itemsByDay = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const key = format(it.date, "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    for (const list of map.values()) {
      list.sort((a, b) => compareAsc(a.date, b.date));
    }
    return map;
  }, [items]);

  const getItems = (day) => itemsByDay.get(format(day, "yyyy-MM-dd")) || [];
  const selectedDateItems = getItems(selectedDate);

  const handleItemClick = (item) => {
    if (!item.route) return;
    navigate(item.route);
  };

  const handlePrev = () => {
    if (viewMode === "month") setCursor(subMonths(cursor, 1));
    else if (viewMode === "week") setCursor(subWeeks(cursor, 1));
    else setCursor(subDays(cursor, 1));
  };
  const handleNext = () => {
    if (viewMode === "month") setCursor(addMonths(cursor, 1));
    else if (viewMode === "week") setCursor(addWeeks(cursor, 1));
    else setCursor(addDays(cursor, 1));
  };
  const handleToday = () => {
    setCursor(new Date());
    setSelectedDate(new Date());
  };

  const headerLabel = useMemo(() => {
    if (viewMode === "month") return format(cursor, "MMMM yyyy");
    if (viewMode === "week") {
      const start = startOfWeek(cursor, { weekStartsOn: 0 });
      const end = endOfWeek(cursor, { weekStartsOn: 0 });
      return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
    }
    return format(cursor, "EEEE, MMM d, yyyy");
  }, [cursor, viewMode]);

  const isLoading = loadingEvents || loadingApps || loadingTasks;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="w-5 h-5 animate-spin text-[#A3A3A3]" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {eventsError && (
        <div className="mb-6 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          Could not load calendar events. Please refresh the page to try again.
        </div>
      )}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0A0A0A]">Career Calendar</h1>
          <p className="text-sm text-[#A3A3A3] mt-1">
            Every task due date, application, and interview in one view.
          </p>
        </div>
        <Button
          onClick={() => setShowAddDialog(true)}
          className="bg-[#0A0A0A] hover:bg-[#262626]"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Event
        </Button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-6 text-xs text-[#525252]">
        <LegendDot className={APP_APPLIED_DOT} label="Applied" />
        <LegendDot className={EVENT_TYPE_DOTS.interview} label="Interview" />
        <LegendDot className={EVENT_TYPE_DOTS.follow_up} label="Follow-up" />
        <LegendDot className={EVENT_TYPE_DOTS.networking_event} label="Networking" />
        <LegendDot className={TASK_PRIORITY_DOTS.high} label="Task · high" />
        <LegendDot className={TASK_PRIORITY_DOTS.medium} label="Task · medium" />
        <LegendDot className={TASK_PRIORITY_DOTS.low} label="Task · low" />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrev} className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleToday}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={handleNext} className="h-8 w-8">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <span className="ml-2 text-base font-semibold text-[#0A0A0A]">{headerLabel}</span>
        </div>
        <div className="inline-flex rounded-lg border border-[#E5E5E5] bg-white p-0.5">
          {VIEW_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setViewMode(mode.id)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                viewMode === mode.id
                  ? "bg-[#0A0A0A] text-white"
                  : "text-[#525252] hover:bg-[#F5F5F5]"
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "day" ? (
        <DayView
          date={cursor}
          items={getItems(cursor)}
          onItemClick={handleItemClick}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 border-[#E5E5E5]">
            <CardContent className="p-4">
              {viewMode === "month" ? (
                <MonthGrid
                  cursor={cursor}
                  selectedDate={selectedDate}
                  setSelectedDate={setSelectedDate}
                  getItems={getItems}
                />
              ) : (
                <WeekGrid
                  cursor={cursor}
                  selectedDate={selectedDate}
                  setSelectedDate={setSelectedDate}
                  getItems={getItems}
                />
              )}
            </CardContent>
          </Card>

          <Card className="border-[#E5E5E5]">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">
                {format(selectedDate, "MMM d, yyyy")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedDateItems.length === 0 ? (
                <p className="text-sm text-[#A3A3A3] text-center py-8">
                  Nothing scheduled for this day.
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedDateItems.map((item) => (
                    <ItemCard key={item.id} item={item} onClick={() => handleItemClick(item)} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <AddEventDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        applications={applications}
        onEventAdded={() => {
          queryClient.invalidateQueries({ queryKey: ["calendarEvents"] });
        }}
      />
    </div>
  );
}

function LegendDot({ className, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("w-2 h-2 rounded-full", className)} />
      <span>{label}</span>
    </span>
  );
}

function MonthGrid({ cursor, selectedDate, setSelectedDate, getItems }) {
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center text-xs font-medium text-[#A3A3A3] py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => (
          <DayCell
            key={day.toISOString()}
            day={day}
            inMonth={isSameMonth(day, cursor)}
            items={getItems(day)}
            selected={isSameDay(day, selectedDate)}
            isToday={isSameDay(day, new Date())}
            onClick={() => setSelectedDate(day)}
            compact={false}
          />
        ))}
      </div>
    </div>
  );
}

function WeekGrid({ cursor, selectedDate, setSelectedDate, getItems }) {
  const weekStart = startOfWeek(cursor, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(cursor, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {days.map((d) => (
          <div key={d.toISOString()} className="text-center text-xs font-medium text-[#A3A3A3] py-2">
            {format(d, "EEE")}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => (
          <DayCell
            key={day.toISOString()}
            day={day}
            inMonth
            items={getItems(day)}
            selected={isSameDay(day, selectedDate)}
            isToday={isSameDay(day, new Date())}
            onClick={() => setSelectedDate(day)}
            compact
          />
        ))}
      </div>
    </div>
  );
}

function DayCell({ day, inMonth, items, selected, isToday, onClick, compact }) {
  const visible = items.slice(0, compact ? 6 : 3);
  const overflow = items.length - visible.length;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex flex-col gap-1 p-2 rounded-lg text-left transition-colors min-h-[84px]",
        compact && "min-h-[140px]",
        !inMonth ? "text-[#D4D4D4] bg-[#FAFAFA]" : "text-[#0A0A0A] bg-white",
        selected ? "ring-2 ring-[#0A0A0A]" : "hover:bg-[#F5F5F5]",
        isToday && !selected && "border-2 border-[#2563EB]"
      )}
    >
      <span className="text-xs font-medium">{format(day, "d")}</span>
      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
        {visible.map((it) => (
          <div
            key={it.id}
            className={cn(
              "flex items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-tight truncate",
              it.chipClass,
              it.completed && "line-through opacity-60"
            )}
            title={`${it.title}${it.subtitle ? ` — ${it.subtitle}` : ""}`}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", it.dotClass)} />
            <span className="truncate">{it.title}</span>
          </div>
        ))}
        {overflow > 0 && (
          <span className="text-[10px] text-[#A3A3A3] px-1">+{overflow} more</span>
        )}
      </div>
    </button>
  );
}

function DayView({ date, items, onItemClick }) {
  return (
    <Card className="border-[#E5E5E5]">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-[#525252]" />
          {format(date, "EEEE, MMMM d")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-[#A3A3A3] text-center py-10">
            Nothing scheduled for this day.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <ItemCard key={it.id} item={it} onClick={() => onItemClick(it)} expanded />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ItemCard({ item, onClick, expanded = false }) {
  const Icon =
    item.kind === "task" ? CheckSquare : item.kind === "application" ? ClipboardList : CalendarDays;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-lg border transition-colors hover:shadow-sm",
        item.chipClass,
        item.completed && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
            <span className={cn("text-sm font-semibold truncate", item.completed && "line-through")}>
              {item.title}
            </span>
          </div>
          {item.subtitle && (
            <p className="text-[11px] mt-0.5 opacity-80">{item.subtitle}</p>
          )}
          {item.kind === "event" && !item.allDay && item.startISO && (
            <div className="flex items-center gap-1 text-[11px] mt-1">
              <Clock className="w-3 h-3" />
              <span>
                {(() => {
                  try {
                    return format(parseISO(item.startISO), "h:mm a");
                  } catch {
                    return "";
                  }
                })()}
                {item.endISO && (
                  <>
                    <span> – </span>
                    {(() => {
                      try {
                        return format(parseISO(item.endISO), "h:mm a");
                      } catch {
                        return "";
                      }
                    })()}
                  </>
                )}
              </span>
            </div>
          )}
          {item.location && (
            <div className="flex items-center gap-1 text-[11px] mt-1">
              <MapPin className="w-3 h-3" />
              <span className="truncate">{item.location}</span>
            </div>
          )}
          {expanded && item.description && (
            <p className="text-[11px] mt-1.5 opacity-80 whitespace-pre-wrap">{item.description}</p>
          )}
        </div>
        <ArrowRight className="w-3.5 h-3.5 flex-shrink-0 mt-1 opacity-60" />
      </div>
    </button>
  );
}
