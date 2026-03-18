import React, { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

export default function AddEventDialog({ open, onClose, applications, onEventAdded }) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    event_type: "interview",
    start_date: "",
    start_time: "",
    end_date: "",
    end_time: "",
    all_day: false,
    application_id: "",
    location: "",
    reminder_minutes: 60
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const startDateTime = formData.all_day 
      ? formData.start_date
      : `${formData.start_date}T${formData.start_time}`;
    
    const endDateTime = formData.end_date && formData.end_time
      ? `${formData.end_date}T${formData.end_time}`
      : null;

    await supabase.from("calendar_events").insert({
      user_id: user?.id,
      title: formData.title,
      description: formData.description,
      event_type: formData.event_type,
      start_date: startDateTime,
      end_date: endDateTime,
      all_day: formData.all_day,
      application_id: formData.application_id || null,
      location: formData.location,
      reminder_minutes: formData.reminder_minutes
    });

    onEventAdded();
    onClose();
    setFormData({
      title: "",
      description: "",
      event_type: "interview",
      start_date: "",
      start_time: "",
      end_date: "",
      end_time: "",
      all_day: false,
      application_id: "",
      location: "",
      reminder_minutes: 60
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Calendar Event</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">Event Title</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Interview with Google"
              required
            />
          </div>

          <div>
            <Label htmlFor="event_type">Event Type</Label>
            <Select
              value={formData.event_type}
              onValueChange={(value) => setFormData({ ...formData, event_type: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="interview">Interview</SelectItem>
                <SelectItem value="application_deadline">Application Deadline</SelectItem>
                <SelectItem value="networking_event">Networking Event</SelectItem>
                <SelectItem value="task_deadline">Task Deadline</SelectItem>
                <SelectItem value="follow_up">Follow Up</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="application_id">Link to Application (Optional)</Label>
            <Select
              value={formData.application_id}
              onValueChange={(value) => setFormData({ ...formData, application_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an application" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>None</SelectItem>
                {applications?.map(app => (
                  <SelectItem key={app.id} value={app.id}>
                    {app.role_title} {app.company ? `at ${app.company}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="all_day"
              checked={formData.all_day}
              onCheckedChange={(checked) => setFormData({ ...formData, all_day: checked })}
            />
            <Label htmlFor="all_day" className="cursor-pointer">All-day event</Label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                required
              />
            </div>
            {!formData.all_day && (
              <div>
                <Label htmlFor="start_time">Start Time</Label>
                <Input
                  id="start_time"
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                />
              </div>
            )}
          </div>

          {!formData.all_day && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="end_date">End Date (Optional)</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="end_time">End Time</Label>
                <Input
                  id="end_time"
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="location">Location / Meeting Link</Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="e.g., Zoom link or office address"
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Additional notes about this event"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="bg-[#0A0A0A] hover:bg-[#262626]">
              Add Event
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}