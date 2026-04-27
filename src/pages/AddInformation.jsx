import React, { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function SkillTagger({ skills, onAdd, onRemove, tempValue, setTempValue }) {
  return (
    <div>
      <div className="flex gap-2 mb-2">
        <Input
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder="Add skill and press Enter"
          className="text-sm"
        />
        <Button variant="outline" size="sm" onClick={onAdd} className="text-xs px-3">
          Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {skills.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-xs bg-[#F5F5F5] text-[#525252] px-2 py-1 rounded-md border border-[#E5E5E5]">
            {s}
            <button onClick={() => onRemove(s)} className="hover:text-red-500">
              <Trash2 className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function AddInformation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef(null);

  const { data: profiles, isLoading: loadingProfile } = useQuery({
    queryKey: ["userProfile", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });


  const { data: certifications, isLoading: loadingCerts } = useQuery({
    queryKey: ["certifications", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from("certifications").select("*").eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    initialData: [],
  });

  const { data: projects, isLoading: loadingProjects } = useQuery({
    queryKey: ["projects", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from("projects").select("*").eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    initialData: [],
  });

  const { data: experiences, isLoading: loadingExp } = useQuery({
    queryKey: ["experiences", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from("experiences").select("*").eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    initialData: [],
  });

  const profile = profiles?.[0] || null;

  const [profileForm, setProfileForm] = useState({
    full_name: "",
    phone_number: "",
    location: "",
    linkedin_url: "",
    five_year_role: "",
    education_level: "",
    field_of_study: "",
    education_dates: "",
    skills: [],
    // Languages and secondary_education are jsonb; stored as arrays/objects.
    languages: [],
    secondary_education: { institution: "", location: "", dates: "", highlights: [] },
  });

  React.useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || "",
        phone_number: profile.phone_number || "",
        location: profile.location || "",
        linkedin_url: profile.linkedin_url || "",
        five_year_role: profile.five_year_role || "",
        education_level: profile.education_level || "",
        field_of_study: profile.field_of_study || "",
        education_dates: profile.education_dates || "",
        skills: profile.skills || [],
        languages: Array.isArray(profile.languages) ? profile.languages : [],
        secondary_education: profile.secondary_education && typeof profile.secondary_education === "object"
          ? {
              institution: profile.secondary_education.institution || "",
              location: profile.secondary_education.location || "",
              dates: profile.secondary_education.dates || "",
              highlights: Array.isArray(profile.secondary_education.highlights) ? profile.secondary_education.highlights : [],
            }
          : { institution: "", location: "", dates: "", highlights: [] },
      });
    }
  }, [profile]);

  const [skillInput, setSkillInput] = useState("");

  const [certForm, setCertForm] = useState({ name: "", issuer: "" });
  const [projectForm, setProjectForm] = useState({ name: "", description: "", skills_demonstrated: [], url: "" });
  const [expForm, setExpForm] = useState({
    id: null, // set when editing an existing row
    title: "",
    company: "",
    type: "internship",
    start_date: "",
    end_date: "",
    is_current: false,
    responsibilities: "",
    skills_used: [],
  });

  const [tempSkill, setTempSkill] = useState("");

  const saveProfile = async () => {
    setSaving(true);
    // Normalize secondary_education: if everything in it is empty, save null
    // instead of an empty object — the CV renderer gates rendering on truthy
    // institution and we don't want to show an empty Education entry.
    const se = profileForm.secondary_education || {};
    const seHasContent = !!(se.institution?.trim() || se.location?.trim() || se.dates?.trim() || (se.highlights || []).some((h) => h?.trim()));
    const dbFields = {
      full_name: profileForm.full_name,
      phone_number: profileForm.phone_number,
      location: profileForm.location,
      linkedin_url: profileForm.linkedin_url,
      five_year_role: profileForm.five_year_role,
      education_level: profileForm.education_level,
      field_of_study: profileForm.field_of_study,
      education_dates: profileForm.education_dates,
      skills: profileForm.skills,
      languages: profileForm.languages,
      secondary_education: seHasContent ? se : null,
    };
    const { error } = profile
      ? await supabase.from("profiles").update(dbFields).eq("id", user.id)
      : await supabase.from("profiles").insert({ id: user.id, ...dbFields });
    if (error) {
      console.error("Failed to save profile:", error);
      toast.error("Failed to save profile: " + error.message);
      setSaving(false);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["userProfile"] });
    toast.success("Profile saved.");
    setSaving(false);
  };

  const addSkill = () => {
    if (skillInput.trim() && !profileForm.skills.includes(skillInput.trim())) {
      setProfileForm({ ...profileForm, skills: [...profileForm.skills, skillInput.trim()] });
      setSkillInput("");
    }
  };

  const removeSkill = (skill) => {
    setProfileForm({ ...profileForm, skills: profileForm.skills.filter((s) => s !== skill) });
  };

  const handleResumeUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const filePath = `${user.id}/resume.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: signedData } = await supabase.storage
        .from("resumes")
        .createSignedUrl(filePath, 315360000); // ~10 years

      const resumeUrl = signedData?.signedUrl || filePath;
      await supabase.from("profiles").update({ resume_url: resumeUrl }).eq("id", user.id);
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      toast.success("Resume uploaded successfully!");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      console.error("Resume upload error:", err);
      toast.error("Failed to upload resume: " + err.message);
    }
    setUploading(false);
  };

  const addCert = async () => {
    if (!certForm.name) return;
    const { error } = await supabase.from("certifications").insert({
      name: certForm.name,
      issuer: certForm.issuer,
      user_id: user.id,
    });
    if (error) {
      console.error("Failed to add certification:", error);
      toast.error("Failed to add certification: " + error.message);
      return;
    }
    setCertForm({ name: "", issuer: "" });
    queryClient.invalidateQueries({ queryKey: ["certifications"] });
    toast.success("Certification added.");
  };

  const addProject = async () => {
    if (!projectForm.name) return;
    const { error } = await supabase.from("projects").insert({ ...projectForm, user_id: user.id });
    if (error) {
      console.error("Failed to add project:", error);
      toast.error("Failed to add project: " + error.message);
      return;
    }
    setProjectForm({ name: "", description: "", skills_demonstrated: [], url: "" });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    toast.success("Project added.");
  };

  const resetExpForm = () => setExpForm({
    id: null,
    title: "",
    company: "",
    type: "internship",
    start_date: "",
    end_date: "",
    is_current: false,
    responsibilities: "",
    skills_used: [],
  });

  const addExperience = async () => {
    if (!expForm.title || !expForm.company) return;
    const { id, ...payload } = expForm;
    const row = { ...payload, user_id: user.id };
    const { error } = id
      ? await supabase.from("experiences").update(row).eq("id", id).eq("user_id", user.id)
      : await supabase.from("experiences").insert(row);
    if (error) {
      console.error("Failed to save experience:", error);
      toast.error(`Failed to ${id ? "update" : "add"} experience: ${error.message}`);
      return;
    }
    const wasEdit = Boolean(id);
    resetExpForm();
    queryClient.invalidateQueries({ queryKey: ["experiences"] });
    toast.success(wasEdit ? "Experience updated." : "Experience added.");
  };

  const isLoading = loadingProfile || loadingCerts || loadingProjects || loadingExp;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="w-5 h-5 animate-spin text-[#A3A3A3]" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-[#0A0A0A]">Profile</h1>
        <p className="text-sm text-[#A3A3A3] mt-1">
          Personal info, experience, education, and skills. Every change retriggers career analysis.
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-[#F5F5F5] w-full justify-start overflow-x-auto">
          <TabsTrigger value="profile" className="text-xs">Profile</TabsTrigger>
          <TabsTrigger value="certifications" className="text-xs">Certifications</TabsTrigger>
          <TabsTrigger value="projects" className="text-xs">Projects</TabsTrigger>
          <TabsTrigger value="experience" className="text-xs">Experience</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <div className="bg-white rounded-xl border border-[#E5E5E5] p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Full Name</label>
                <Input value={profileForm.full_name} onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })} className="mt-1" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Phone Number</label>
                <Input value={profileForm.phone_number} onChange={(e) => setProfileForm({ ...profileForm, phone_number: e.target.value })} className="mt-1" placeholder="054-1234567 or +972 54 123 4567" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Location</label>
                <Input value={profileForm.location} onChange={(e) => setProfileForm({ ...profileForm, location: e.target.value })} className="mt-1" placeholder="e.g. Tel Aviv, Israel" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">5-Year Target Role</label>
                <Input value={profileForm.five_year_role} onChange={(e) => setProfileForm({ ...profileForm, five_year_role: e.target.value })} className="mt-1" placeholder="e.g. Senior Data Scientist" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Education Level</label>
                <Select value={profileForm.education_level} onValueChange={(v) => setProfileForm({ ...profileForm, education_level: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high_school">High School</SelectItem>
                    <SelectItem value="bachelors">Bachelors</SelectItem>
                    <SelectItem value="masters">Masters</SelectItem>
                    <SelectItem value="phd">PhD</SelectItem>
                    <SelectItem value="bootcamp">Bootcamp</SelectItem>
                    <SelectItem value="self_taught">Self Taught</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Field of Study</label>
                <Input value={profileForm.field_of_study} onChange={(e) => setProfileForm({ ...profileForm, field_of_study: e.target.value })} className="mt-1" placeholder="e.g. Computer Science" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Education Dates</label>
                <Input value={profileForm.education_dates} onChange={(e) => setProfileForm({ ...profileForm, education_dates: e.target.value })} className="mt-1" placeholder="e.g. 2023 - Present" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">LinkedIn URL</label>
                <Input value={profileForm.linkedin_url} onChange={(e) => setProfileForm({ ...profileForm, linkedin_url: e.target.value })} className="mt-1" placeholder="https://linkedin.com/in/..." />
              </div>
            </div>

            {/* Languages editor — free-form language name + proficiency dropdown */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-2 block">Languages</label>
              <div className="space-y-2">
                {profileForm.languages.map((lang, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      value={lang.language || ""}
                      onChange={(e) => {
                        const next = [...profileForm.languages];
                        next[i] = { ...next[i], language: e.target.value };
                        setProfileForm({ ...profileForm, languages: next });
                      }}
                      placeholder="e.g. English"
                      className="text-sm flex-1"
                    />
                    <Select
                      value={lang.proficiency || ""}
                      onValueChange={(v) => {
                        const next = [...profileForm.languages];
                        next[i] = { ...next[i], proficiency: v };
                        setProfileForm({ ...profileForm, languages: next });
                      }}
                    >
                      <SelectTrigger className="text-sm w-40">
                        <SelectValue placeholder="Proficiency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Native">Native</SelectItem>
                        <SelectItem value="Fluent">Fluent</SelectItem>
                        <SelectItem value="Professional">Professional</SelectItem>
                        <SelectItem value="Conversational">Conversational</SelectItem>
                        <SelectItem value="Basic">Basic</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const next = profileForm.languages.filter((_, idx) => idx !== i);
                        setProfileForm({ ...profileForm, languages: next });
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-[#A3A3A3] hover:text-red-500" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setProfileForm({ ...profileForm, languages: [...profileForm.languages, { language: "", proficiency: "Fluent" }] })}
                  className="text-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add language
                </Button>
              </div>
            </div>

            {/* Secondary / high-school education (optional) */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-2 block">High School / Secondary Education (optional)</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input
                  value={profileForm.secondary_education.institution}
                  onChange={(e) => setProfileForm({ ...profileForm, secondary_education: { ...profileForm.secondary_education, institution: e.target.value } })}
                  placeholder="Institution name"
                  className="text-sm"
                />
                <Input
                  value={profileForm.secondary_education.dates}
                  onChange={(e) => setProfileForm({ ...profileForm, secondary_education: { ...profileForm.secondary_education, dates: e.target.value } })}
                  placeholder="e.g. 2014 - 2018"
                  className="text-sm"
                />
                <Input
                  value={profileForm.secondary_education.location}
                  onChange={(e) => setProfileForm({ ...profileForm, secondary_education: { ...profileForm.secondary_education, location: e.target.value } })}
                  placeholder="Location (optional)"
                  className="text-sm md:col-span-2"
                />
                <Textarea
                  value={(profileForm.secondary_education.highlights || []).join("\n")}
                  onChange={(e) => setProfileForm({ ...profileForm, secondary_education: { ...profileForm.secondary_education, highlights: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) } })}
                  placeholder="Notable roles / activities — one per line (e.g. President of Debate Club)"
                  rows={2}
                  className="text-sm md:col-span-2"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-2 block">Skills</label>
              <div className="flex gap-2 mb-2">
                <Input value={skillInput} onChange={(e) => setSkillInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }} placeholder="Type a skill and press Enter" className="text-sm" />
                <Button variant="outline" size="sm" onClick={addSkill} className="text-xs px-3">Add</Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {profileForm.skills.map((s, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs bg-[#F5F5F5] text-[#525252] px-2 py-1 rounded-md border border-[#E5E5E5]">
                    {s}
                    <button onClick={() => removeSkill(s)} className="hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-2 block">Resume</label>
              <div className="flex items-center gap-3">
                <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-[#E5E5E5] rounded-lg text-sm text-[#525252] hover:bg-[#F5F5F5] transition-colors">
                  <Upload className="w-4 h-4" />
                  {uploading ? "Uploading..." : "Upload Resume"}
                  <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={handleResumeUpload} />
                </label>
                {profile?.resume_url && <span className="text-xs text-[#059669]">Resume uploaded</span>}
              </div>
            </div>

            <Button onClick={saveProfile} disabled={saving} className="bg-[#0A0A0A] hover:bg-[#262626] text-sm">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save Profile"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="certifications">
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-[#E5E5E5] p-6 space-y-4">
              <h3 className="text-sm font-semibold text-[#0A0A0A]">Add Certification</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Certification Name</label>
                  <Input value={certForm.name} onChange={(e) => setCertForm({ ...certForm, name: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Issuer</label>
                  <Input value={certForm.issuer} onChange={(e) => setCertForm({ ...certForm, issuer: e.target.value })} className="mt-1" placeholder="e.g. AWS, Google" />
                </div>
              </div>
              <Button onClick={addCert} className="bg-[#0A0A0A] hover:bg-[#262626] text-sm">
                <Plus className="w-4 h-4 mr-2" />Add Certification
              </Button>
            </div>
            {certifications.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs uppercase tracking-wider text-[#A3A3A3] font-medium">Your Certifications</h3>
                {certifications.map((c) => (
                  <div key={c.id} className="bg-white rounded-lg border border-[#E5E5E5] px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-[#0A0A0A]">{c.name}</p>
                      <p className="text-xs text-[#A3A3A3]">{c.issuer}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={async () => { const { error } = await supabase.from("certifications").delete().eq("id", c.id).eq("user_id", user.id); if (error) { toast.error("Failed to delete certification."); return; } queryClient.invalidateQueries({ queryKey: ["certifications"] }); toast.success("Certification removed."); }}>
                      <Trash2 className="w-4 h-4 text-[#A3A3A3] hover:text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="projects">
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-[#E5E5E5] p-6 space-y-4">
              <h3 className="text-sm font-semibold text-[#0A0A0A]">Add Project</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Project Name</label>
                  <Input value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">URL</label>
                  <Input value={projectForm.url} onChange={(e) => setProjectForm({ ...projectForm, url: e.target.value })} className="mt-1" placeholder="https://github.com/..." />
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Description</label>
                <Textarea value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} className="mt-1" rows={3} />
              </div>
              <Button onClick={addProject} className="bg-[#0A0A0A] hover:bg-[#262626] text-sm">
                <Plus className="w-4 h-4 mr-2" />Add Project
              </Button>
            </div>
            {projects.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs uppercase tracking-wider text-[#A3A3A3] font-medium">Your Projects</h3>
                {projects.map((p) => (
                  <div key={p.id} className="bg-white rounded-lg border border-[#E5E5E5] px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-[#0A0A0A]">{p.name}</p>
                      <p className="text-xs text-[#A3A3A3]">{p.description?.substring(0, 60)}{p.description?.length > 60 ? "..." : ""}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={async () => { const { error } = await supabase.from("projects").delete().eq("id", p.id).eq("user_id", user.id); if (error) { toast.error("Failed to delete project."); return; } queryClient.invalidateQueries({ queryKey: ["projects"] }); toast.success("Project removed."); }}>
                      <Trash2 className="w-4 h-4 text-[#A3A3A3] hover:text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="experience">
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-[#E5E5E5] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#0A0A0A]">
                  {expForm.id ? "Edit Experience" : "Add Experience"}
                </h3>
                {expForm.id && (
                  <button onClick={resetExpForm} className="text-xs text-[#A3A3A3] hover:text-[#525252] underline">
                    Cancel edit
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Title</label>
                  <Input value={expForm.title} onChange={(e) => setExpForm({ ...expForm, title: e.target.value })} className="mt-1" placeholder="e.g. Sergeant First Class, Marketing Intern" />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Company / Unit / Organization</label>
                  <Input value={expForm.company} onChange={(e) => setExpForm({ ...expForm, company: e.target.value })} className="mt-1" placeholder="e.g. Nahal Brigade, Google" />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Start Date</label>
                  <Input value={expForm.start_date} onChange={(e) => setExpForm({ ...expForm, start_date: e.target.value })} className="mt-1" placeholder="e.g. Oct 2025 or 2020" />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">End Date</label>
                  <Input
                    value={expForm.end_date}
                    onChange={(e) => setExpForm({ ...expForm, end_date: e.target.value, is_current: e.target.value.toLowerCase() === "present" })}
                    className="mt-1"
                    placeholder="e.g. Jul 2025 or Present"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Type</label>
                <Select value={expForm.type} onValueChange={(v) => setExpForm({ ...expForm, type: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internship">Internship</SelectItem>
                    <SelectItem value="full_time">Full Time</SelectItem>
                    <SelectItem value="part_time">Part Time</SelectItem>
                    <SelectItem value="freelance">Freelance</SelectItem>
                    <SelectItem value="volunteer">Volunteer</SelectItem>
                    <SelectItem value="leadership">Leadership / Club</SelectItem>
                    <SelectItem value="military">Military / IDF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Responsibilities</label>
                <Textarea
                  value={expForm.responsibilities}
                  onChange={(e) => setExpForm({ ...expForm, responsibilities: e.target.value })}
                  className="mt-1"
                  rows={5}
                  placeholder="One responsibility per line. Examples:&#10;Led a team of 5 engineers on the onboarding feature.&#10;Awarded Presidential Award for Excellence (Independence Day 2022)."
                />
              </div>
              <Button onClick={addExperience} className="bg-[#0A0A0A] hover:bg-[#262626] text-sm">
                {expForm.id ? (<>Update Experience</>) : (<><Plus className="w-4 h-4 mr-2" />Add Experience</>)}
              </Button>
            </div>
            {experiences.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs uppercase tracking-wider text-[#A3A3A3] font-medium">Your Experience</h3>
                {experiences.map((e) => (
                  <div key={e.id} className="bg-white rounded-lg border border-[#E5E5E5] px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#0A0A0A] truncate">{e.title} <span className="text-[#A3A3A3]">at</span> {e.company}</p>
                      <p className="text-xs text-[#A3A3A3]">
                        {e.type?.replace("_", " ")}
                        {e.start_date ? ` · ${e.start_date}${e.end_date ? ` – ${e.end_date}` : ""}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpForm({
                          id: e.id,
                          title: e.title || "",
                          company: e.company || "",
                          type: e.type || "internship",
                          start_date: e.start_date || "",
                          end_date: e.end_date || "",
                          is_current: !!e.is_current,
                          responsibilities: e.responsibilities || "",
                          skills_used: e.skills_used || [],
                        })}
                        className="text-xs"
                      >
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={async () => { const { error } = await supabase.from("experiences").delete().eq("id", e.id).eq("user_id", user.id); if (error) { toast.error("Failed to delete experience."); return; } queryClient.invalidateQueries({ queryKey: ["experiences"] }); if (expForm.id === e.id) resetExpForm(); toast.success("Experience removed."); }}>
                        <Trash2 className="w-4 h-4 text-[#A3A3A3] hover:text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}