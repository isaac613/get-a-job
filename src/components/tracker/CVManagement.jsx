import React, { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, Sparkles, Download, Save } from "lucide-react";
import { toast } from "sonner";
import { TemplatePicker } from "@/components/chat/ChatInterface";
import TemplateManager from "@/components/cv/TemplateManager";

export default function CVManagement({ app, onUpdate }) {
  const { user } = useAuth();
  const [cvName, setCvName] = useState(app.cv_version_name || "");
  const [cvStatus, setCvStatus] = useState(app.cv_status || "not_started");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  // Default to whichever template the application was last generated with.
  // If the row has a custom_template_id we preselect that; otherwise fall
  // back to the built-in cv_template_id or "classic".
  const [templateId, setTemplateId] = useState(app.cv_template_id || "classic");
  const [customTemplateId, setCustomTemplateId] = useState(app.custom_template_id || null);
  const [templatesDialogOpen, setTemplatesDialogOpen] = useState(false);

  const { data: customTemplates = [] } = useQuery({
    queryKey: ["cvTemplates", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("cv_templates")
        .select("id, name, is_default, created_at")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("applications").update({
      cv_version_name: cvName,
      cv_status: cvStatus,
    }).eq("id", app.id);
    setSaving(false);
    if (error) {
      console.error("Failed to save CV details:", error);
      toast.error("Failed to save. Please try again.");
      return;
    }
    onUpdate();
  };

  const handleGenerateCV = async () => {
    if (!app.job_description) {
      toast.error("Please add a job description first in the Job Description tab");
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-tailored-cv", {
        body: {
          job_description: app.job_description,
          target_role: app.role_title,
          application_id: app.id,
          template_id: customTemplateId ? null : templateId,
          custom_template_id: customTemplateId || null,
        },
      });

      if (error) throw error;

      toast.success(data?.message || "CV generated successfully!");
      onUpdate(); // Refresh application data
    } catch (error) {
      toast.error("Failed to generate CV: " + error.message);
    } finally {
      setGenerating(false);
    }
  };


  return (
    <div className="space-y-4">
      <div>
        <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">
          CV Version Name
        </label>
        <Input
          value={cvName}
          onChange={(e) => setCvName(e.target.value)}
          placeholder="e.g., Customer Success CV - Monday"
          className="mt-1"
        />
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">
          CV Status
        </label>
        <Select value={cvStatus} onValueChange={setCvStatus}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="not_started">Not Started</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {app.cv_skills_emphasized && app.cv_skills_emphasized.length > 0 && (
        <div>
          <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-2 block">
            Skills Emphasized
          </label>
          <div className="flex flex-wrap gap-2">
            {app.cv_skills_emphasized.map((skill, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {skill}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {app.cv_url && (
        <div className="bg-[#F5F5F5] rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#525252]" />
            <span className="text-xs text-[#525252]">CV Generated</span>
          </div>
          <a
            href={app.cv_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#0A0A0A] underline flex items-center gap-1"
          >
            <Download className="w-3 h-3" />
            Download (.docx)
          </a>
        </div>
      )}

      <div>
        <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-2 block">
          CV Template
        </label>
        <TemplatePicker
          value={templateId}
          onChange={(id) => { setTemplateId(id); setCustomTemplateId(null); }}
          customValue={customTemplateId}
          onCustomChange={(id) => setCustomTemplateId(id)}
          customTemplates={customTemplates}
          onManage={() => setTemplatesDialogOpen(true)}
          disabled={generating}
        />
      </div>

      <Dialog open={templatesDialogOpen} onOpenChange={setTemplatesDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage CV Templates</DialogTitle>
          </DialogHeader>
          <TemplateManager onClose={() => setTemplatesDialogOpen(false)} />
        </DialogContent>
      </Dialog>

      <div className="flex gap-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          variant="outline"
          className="text-sm"
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
          ) : (
            <><Save className="w-4 h-4 mr-2" />Save Changes</>
          )}
        </Button>
        <Button
          onClick={handleGenerateCV}
          disabled={generating}
          className="bg-[#0A0A0A] hover:bg-[#262626] text-sm"
        >
          {generating ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</>
          ) : (
            <><Sparkles className="w-4 h-4 mr-2" />AI Generate CV</>
          )}
        </Button>
      </div>
    </div>
  );
}