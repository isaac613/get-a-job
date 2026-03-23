import React, { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Clock, MapPin, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, parseISO } from "date-fns";
import AddEventDialog from "../components/calendar/AddEventDialog";

export default function Calendar() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: events, isLoading, isError: eventsError } = useQuery({
    queryKey: ["calendarEvents", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from("calendar_events").select("*").eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    initialData: [],
  });

  const { data: applications } = useQuery({
    queryKey: ["applications", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from("applications").select("*").eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    initialData: [],
  });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const getEventsForDate = (date) => {
    return events.filter(event => {
      const eventDate = parseISO(event.start_date);
      return isSameDay(eventDate, date);
    });
  };

  const selectedDateEvents = getEventsForDate(selectedDate);

  const eventTypeColors = {
    interview: "bg-red-100 border-red-300 text-red-800",
    application_deadline: "bg-amber-100 border-amber-300 text-amber-800",
    networking_event: "bg-blue-100 border-blue-300 text-blue-800",
    task_deadline: "bg-purple-100 border-purple-300 text-purple-800",
    follow_up: "bg-green-100 border-green-300 text-green-800"
  };

  const eventTypeLabels = {
    interview: "Interview",
    application_deadline: "Application Deadline",
    networking_event: "Networking",
    task_deadline: "Task Deadline",
    follow_up: "Follow Up"
  };

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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0A0A0A]">Career Calendar</h1>
          <p className="text-sm text-[#A3A3A3] mt-1">
            Track interviews, applications, and important career events
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar View */}
        <Card className="lg:col-span-2 border-[#E5E5E5]">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">
                {format(currentMonth, "MMMM yyyy")}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  className="h-8 w-8"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentMonth(new Date())}
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  className="h-8 w-8"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                <div key={day} className="text-center text-xs font-medium text-[#A3A3A3] py-2">
                  {day}
                </div>
              ))}
              {daysInMonth.map(day => {
                const dayEvents = getEventsForDate(day);
                const isSelected = isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());
                
                return (
                  <button
                    key={day.toString()}
                    onClick={() => setSelectedDate(day)}
                    className={`
                      relative aspect-square p-2 rounded-lg text-sm transition-all
                      ${!isSameMonth(day, currentMonth) ? "text-[#E5E5E5]" : "text-[#0A0A0A]"}
                      ${isSelected ? "bg-[#0A0A0A] text-white" : "hover:bg-[#F5F5F5]"}
                      ${isToday && !isSelected ? "border-2 border-[#2563EB]" : ""}
                    `}
                  >
                    <span className="block text-center">{format(day, "d")}</span>
                    {dayEvents.length > 0 && (
                      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1">
                        {dayEvents.slice(0, 3).map((_, idx) => (
                          <span
                            key={idx}
                            className={`w-1 h-1 rounded-full ${isSelected ? "bg-white" : "bg-[#2563EB]"}`}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Events for Selected Date */}
        <Card className="border-[#E5E5E5]">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              {format(selectedDate, "MMM d, yyyy")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedDateEvents.length === 0 ? (
              <p className="text-sm text-[#A3A3A3] text-center py-8">
                No events scheduled for this day
              </p>
            ) : (
              <div className="space-y-3">
                {selectedDateEvents.map(event => (
                  <div
                    key={event.id}
                    className={`p-3 rounded-lg border ${eventTypeColors[event.event_type]}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-sm">{event.title}</h4>
                      <span className="text-xs px-2 py-0.5 rounded bg-white/50">
                        {eventTypeLabels[event.event_type]}
                      </span>
                    </div>
                    {!event.all_day && (
                      <div className="flex items-center gap-1 text-xs mb-1">
                        <Clock className="w-3 h-3" />
                        <span>{format(parseISO(event.start_date), "h:mm a")}</span>
                        {event.end_date && (
                          <>
                            <span>-</span>
                            <span>{format(parseISO(event.end_date), "h:mm a")}</span>
                          </>
                        )}
                      </div>
                    )}
                    {event.location && (
                      <div className="flex items-center gap-1 text-xs mb-1">
                        <MapPin className="w-3 h-3" />
                        <span>{event.location}</span>
                      </div>
                    )}
                    {event.description && (
                      <p className="text-xs mt-2 opacity-80">{event.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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