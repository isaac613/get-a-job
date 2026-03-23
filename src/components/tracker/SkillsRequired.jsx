import React, { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, CheckCircle2, AlertCircle, MinusCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  proven: { icon: CheckCircle2, color: "text-emerald-600", label: "Proven" },
  partial: { icon: AlertCircle, color: "text-amber-600", label: "Partial" },
  missing: { icon: MinusCircle, color: "text-red-500", label: "Missing" },
};

export default function SkillsRequired({ app, onUpdate }) {
  const [skills, setSkills] = useState(app.skills_required || []);
  const [newSkill, setNewSkill] = useState({ skill_name: "", status: "missing", evidence_source: "" });

  const handleAdd = () => {
    if (!newSkill.skill_name) return;
    const previous = skills;
    const updated = [...skills, { ...newSkill, id: crypto.randomUUID() }];
    setSkills(updated);
    saveSkills(updated, previous);
    setNewSkill({ skill_name: "", status: "missing", evidence_source: "" });
  };

  const handleRemove = (index) => {
    const previous = skills;
    const updated = skills.filter((_, i) => i !== index);
    setSkills(updated);
    saveSkills(updated, previous);
  };

  const handleUpdate = (index, field, value) => {
    const previous = skills;
    const updated = skills.map((s, i) => (i === index ? { ...s, [field]: value } : s));
    setSkills(updated);
    saveSkills(updated, previous);
  };

  const saveSkills = async (updated, previous) => {
    const { error } = await supabase.from("applications").update({ skills_required: updated }).eq("id", app.id);
    if (error) {
      console.error("Failed to save skills:", error);
      setSkills(previous);
      toast.error("Failed to save. Please try again.");
      return;
    }
    onUpdate();
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">
        Skills Required for This Role
      </p>

      {skills.length === 0 ? (
        <p className="text-xs text-[#A3A3A3] py-4 text-center">
          No skills added yet. Add skills to track your qualification gaps.
        </p>
      ) : (
        <div className="space-y-2">
          {skills.map((skill, i) => {
            const config = STATUS_CONFIG[skill.status];
            const Icon = config.icon;
            return (
              <div key={skill.id ?? i} className="bg-[#FAFAFA] rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 flex-1">
                    <Icon className={cn("w-4 h-4 mt-0.5", config.color)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#0A0A0A]">{skill.skill_name}</p>
                      {skill.evidence_source && (
                        <p className="text-xs text-[#A3A3A3] mt-0.5">{skill.evidence_source}</p>
                      )}
                      <Select
                        value={skill.status}
                        onValueChange={(v) => handleUpdate(i, "status", v)}
                      >
                        <SelectTrigger className="mt-2 h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="proven">Proven</SelectItem>
                          <SelectItem value="partial">Partial</SelectItem>
                          <SelectItem value="missing">Missing</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <button onClick={() => handleRemove(i)} className="text-[#A3A3A3] hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-[#E5E5E5] pt-4 space-y-3">
        <p className="text-xs font-medium text-[#525252]">Add New Skill</p>
        <Input
          placeholder="Skill name (e.g., SQL, Python)"
          value={newSkill.skill_name}
          onChange={(e) => setNewSkill({ ...newSkill, skill_name: e.target.value })}
          className="text-sm"
        />
        <Input
          placeholder="Evidence source (e.g., Data Analysis Project)"
          value={newSkill.evidence_source}
          onChange={(e) => setNewSkill({ ...newSkill, evidence_source: e.target.value })}
          className="text-sm"
        />
        <Select
          value={newSkill.status}
          onValueChange={(v) => setNewSkill({ ...newSkill, status: v })}
        >
          <SelectTrigger className="text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="proven">Proven</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="missing">Missing</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={handleAdd} className="bg-[#0A0A0A] hover:bg-[#262626] text-sm w-full">
          <Plus className="w-4 h-4 mr-2" />
          Add Skill
        </Button>
      </div>
    </div>
  );
}