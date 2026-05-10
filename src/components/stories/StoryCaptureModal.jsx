import React, { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Local TagEditor for metrics, skills_demonstrated, tools_used, relevance_tags
function TagEditor({ tags, onChange, placeholder }) {
  const [val, setVal] = useState("");
  const add = () => {
    const v = val.trim();
    if (!v) return;
    if (tags.includes(v)) { setVal(""); return; }
    onChange([...tags, v]);
    setVal("");
  };
  const remove = (t) => onChange(tags.filter((x) => x !== t));
  return (
    <div>
      <div className="flex gap-2 mb-2">
        <Input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder || "Add and press Enter"}
          className="text-sm"
        />
        <Button variant="outline" size="sm" onClick={add} className="text-xs px-3">Add</Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-xs bg-[#F5F5F5] text-[#525252] px-2 py-1 rounded-md border border-[#E5E5E5]">
              {t}
              <button onClick={() => remove(t)} className="hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StoryCaptureModal({ isOpen, onClose, source, initialExperienceId = null }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [step, setStep] = useState(1); // 1 = input, 2 = review
  const [text, setText] = useState("");
  const [selectedExperienceId, setSelectedExperienceId] = useState(initialExperienceId);
  
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  
  const [extractedData, setExtractedData] = useState(null); // { story: {}, extraction_notes: "" }

  // Fetch experiences if this is a quick add and we want to let them pick
  const { data: experiences } = useQuery({
    queryKey: ["experiences", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from("experiences").select("id, title, company").eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!user?.id && source === "manual_quick_add",
  });

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (isOpen) {
      setStep(1);
      setText("");
      setSelectedExperienceId(initialExperienceId);
      setExtractedData(null);
      setError(null);
    }
  }, [isOpen, initialExperienceId]);

  const handleExtract = async () => {
    if (!text.trim()) {
      setError("Please paste or write a story to extract.");
      return;
    }
    setError(null);
    setExtracting(true);
    
    try {
      const payload = {
        text: text.trim(),
        source,
      };
      if (selectedExperienceId) {
        payload.experience_id = selectedExperienceId;
      }
      
      const { data, error: invokeErr } = await supabase.functions.invoke("extract-story-from-text", {
        body: payload
      });

      if (invokeErr) {
        const status = invokeErr?.context?.status;
        if (status === 429) throw new Error("Rate limit reached. Try again later.");
        throw new Error(invokeErr.message || "Extraction failed. Please try again.");
      }
      
      if (!data || !data.story) {
        throw new Error("AI returned an unexpected response.");
      }
      
      // Ensure all arrays are initialized to prevent map errors
      const story = {
        ...data.story,
        metrics: data.story.metrics || [],
        skills_demonstrated: data.story.skills_demonstrated || [],
        tools_used: data.story.tools_used || [],
        relevance_tags: data.story.relevance_tags || [],
      };

      setExtractedData({ story, extraction_notes: data.extraction_notes });
      setStep(2);
    } catch (e) {
      setError(e.message || "Couldn't extract story.");
      toast.error(e.message || "Extraction failed.");
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!extractedData?.story?.title) {
      toast.error("A title is required.");
      return;
    }
    
    setSaving(true);
    try {
      const { story } = extractedData;
      
      const row = {
        user_id: user.id,
        experience_id: selectedExperienceId || null,
        title: story.title,
        situation: story.situation || null,
        task: story.task || null,
        action: story.action || null,
        result: story.result || null,
        metrics: story.metrics,
        skills_demonstrated: story.skills_demonstrated,
        tools_used: story.tools_used,
        relevance_tags: story.relevance_tags,
        source: source,
      };

      const { error: insertErr } = await supabase.from("stories").insert(row);
      
      if (insertErr) throw insertErr;
      
      toast.success("Story saved successfully!");
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      onClose();
    } catch (e) {
      console.error("Failed to save story:", e);
      toast.error("Failed to save story: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const updateStoryField = (field, value) => {
    setExtractedData(prev => ({
      ...prev,
      story: { ...prev.story, [field]: value }
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {step === 1 ? "Add a Story" : "Review Extracted Story"}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {step === 1 
              ? "Paste raw text from your resume, or write down what you did. The AI will extract the STAR fields and metrics."
              : "Review the AI's extraction. You can edit any field before saving."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-2">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium block mb-1">
                Story Text <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. I led a 5-person team to rebuild the checkout flow, increasing conversion by 12% in two months..."
                rows={8}
                className="text-sm resize-none"
              />
            </div>
            
            {source === "manual_quick_add" && experiences && experiences.length > 0 && (
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium block mb-1">
                  Link to Experience <span className="text-[#A3A3A3] normal-case font-normal">(optional)</span>
                </label>
                <Select value={selectedExperienceId || "__none__"} onValueChange={(v) => setSelectedExperienceId(v === "__none__" ? null : v)}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Select an experience to attach this to" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {experiences.map(exp => (
                      <SelectItem key={exp.id} value={exp.id}>
                        {exp.title} at {exp.company}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
            
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose} disabled={extracting}>Cancel</Button>
              <Button 
                onClick={handleExtract} 
                disabled={extracting || !text.trim()}
                className="bg-[#0A0A0A] hover:bg-[#262626]"
              >
                {extracting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Extracting...</>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-2" />Extract STAR Format</>
                )}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && extractedData && (
          <div className="space-y-5 py-2">
            {extractedData.extraction_notes && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 leading-snug">
                <span className="font-semibold block mb-1">AI Extraction Notes:</span>
                {extractedData.extraction_notes}
              </div>
            )}
            
            <div>
              <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Title <span className="text-red-500">*</span></label>
              <Input 
                value={extractedData.story.title || ""} 
                onChange={(e) => updateStoryField("title", e.target.value)} 
                className="mt-1 text-sm font-medium" 
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Situation</label>
                <Textarea 
                  value={extractedData.story.situation || ""} 
                  onChange={(e) => updateStoryField("situation", e.target.value)} 
                  className="mt-1 text-sm h-24" 
                  placeholder="Context or problem..."
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Task</label>
                <Textarea 
                  value={extractedData.story.task || ""} 
                  onChange={(e) => updateStoryField("task", e.target.value)} 
                  className="mt-1 text-sm h-24" 
                  placeholder="Your responsibility..."
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Action</label>
                <Textarea 
                  value={extractedData.story.action || ""} 
                  onChange={(e) => updateStoryField("action", e.target.value)} 
                  className="mt-1 text-sm h-24" 
                  placeholder="What you actually did..."
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Result</label>
                <Textarea 
                  value={extractedData.story.result || ""} 
                  onChange={(e) => updateStoryField("result", e.target.value)} 
                  className="mt-1 text-sm h-24" 
                  placeholder="The outcome..."
                />
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-1 block">Metrics</label>
                <TagEditor 
                  tags={extractedData.story.metrics} 
                  onChange={(v) => updateStoryField("metrics", v)} 
                  placeholder="e.g. 12% increase" 
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-1 block">Skills Demonstrated</label>
                <TagEditor 
                  tags={extractedData.story.skills_demonstrated} 
                  onChange={(v) => updateStoryField("skills_demonstrated", v)} 
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-1 block">Tools Used</label>
                <TagEditor 
                  tags={extractedData.story.tools_used} 
                  onChange={(v) => updateStoryField("tools_used", v)} 
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-1 block">Relevance Tags</label>
                <TagEditor 
                  tags={extractedData.story.relevance_tags} 
                  onChange={(v) => updateStoryField("relevance_tags", v)} 
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-[#E5E5E5]">
              <Button variant="outline" onClick={() => setStep(1)} disabled={saving}>Back</Button>
              <Button 
                onClick={handleSave} 
                disabled={saving || !extractedData.story.title?.trim()}
                className="bg-[#0A0A0A] hover:bg-[#262626]"
              >
                {saving ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  "Save Story"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
