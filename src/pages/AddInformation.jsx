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

  const { data: profiles, isLoading: loadingProfile } = useQuery({
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

  // Courses table not yet implemented — placeholder to avoid changing tab structure
  const courses = [];

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
    five_year_role: "",
    education_level: "",
    field_of_study: "",
    skills: [],
    years_experience: 0,
    linkedin_url: "",
  });

  React.useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || "",
        five_year_role: profile.five_year_role || "",
        education_level: profile.education_level || "",
        field_of_study: profile.field_of_study || "",
        skills: profile.skills || [],
        years_experience: profile.years_experience || 0,
        linkedin_url: profile.linkedin_url || "",
      });
    }
  }, [profile]);

  const [skillInput, setSkillInput] = useState("");

  const [courseForm, setCourseForm] = useState({ name: "", provider: "", skills_gained: [], completion_status: "completed" });
  const [certForm, setCertForm] = useState({ name: "", issuer: "", skills_validated: [] });
  const [projectForm, setProjectForm] = useState({ name: "", description: "", skills_demonstrated: [], url: "" });
  const [expForm, setExpForm] = useState({ title: "", company: "", type: "internship", description: "", skills_used: [] });

  const [tempSkillCourse, setTempSkillCourse] = useState("");
  const [tempSkillCert, setTempSkillCert] = useState("");
  const [tempSkill, setTempSkill] = useState("");

  const saveProfile = async () => {
    setSaving(true);
    // years_experience is not a column in the profiles table
    const { years_experience, ...dbFields } = profileForm;
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
      const filePath = `${user.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("resumes")
        .getPublicUrl(filePath);

      const resumeUrl = urlData?.publicUrl || filePath;
      await supabase.from("profiles").update({ resume_url: resumeUrl }).eq("id", user.id);
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      toast.success("Resume uploaded successfully!");
    } catch (err) {
      console.error("Resume upload error:", err);
      toast.error("Failed to upload resume: " + err.message);
    }
    setUploading(false);
  };

  const addCourse = () => {
    toast.info("Course tracking is coming soon.");
  };

  const addCert = async () => {
    if (!certForm.name) return;
    const { error } = await supabase.from("certifications").insert({ ...certForm, user_id: user.id });
    if (error) {
      console.error("Failed to add certification:", error);
      toast.error("Failed to add certification: " + error.message);
      return;
    }
    setCertForm({ name: "", issuer: "", skills_validated: [] });
    queryClient.invalidateQueries({ queryKey: ["certifications"] });
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
  };

  const addExperience = async () => {
    if (!expForm.title || !expForm.company) return;
    const { error } = await supabase.from("experiences").insert({ ...expForm, user_id: user.id });
    if (error) {
      console.error("Failed to add experience:", error);
      toast.error("Failed to add experience: " + error.message);
      return;
    }
    setExpForm({ title: "", company: "", type: "internship", description: "", skills_used: [] });
    queryClient.invalidateQueries({ queryKey: ["experiences"] });
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
        <h1 className="text-2xl font-bold tracking-tight text-[#0A0A0A]">Add Information</h1>
        <p className="text-sm text-[#A3A3A3] mt-1">
          Keep your profile updated. Every change retriggers career analysis.
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-[#F5F5F5] w-full justify-start overflow-x-auto">
          <TabsTrigger value="profile" className="text-xs">Profile</TabsTrigger>
          <TabsTrigger value="courses" className="text-xs">Courses</TabsTrigger>
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
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Years of Experience</label>
                <Input type="number" value={profileForm.years_experience} onChange={(e) => setProfileForm({ ...profileForm, years_experience: parseInt(e.target.value) || 0 })} className="mt-1" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">LinkedIn URL</label>
                <Input value={profileForm.linkedin_url} onChange={(e) => setProfileForm({ ...profileForm, linkedin_url: e.target.value })} className="mt-1" placeholder="https://linkedin.com/in/..." />
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
                  <input type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={handleResumeUpload} />
                </label>
                {profile?.resume_url && <span className="text-xs text-[#059669]">Resume uploaded</span>}
              </div>
            </div>

            <Button onClick={saveProfile} disabled={saving} className="bg-[#0A0A0A] hover:bg-[#262626] text-sm">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save Profile"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="courses">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
            <p className="text-sm font-semibold text-amber-800 mb-1">Course Tracking — Coming Soon</p>
            <p className="text-xs text-amber-700">
              You'll be able to log courses, track completion, and map skills gained directly to your profile. Check back soon.
            </p>
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
                    <Button variant="ghost" size="sm" onClick={async () => { const { error } = await supabase.from("certifications").delete().eq("id", c.id).eq("user_id", user.id); if (error) { toast.error("Failed to delete certification."); return; } queryClient.invalidateQueries({ queryKey: ["certifications"] }); }}>
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
                    <Button variant="ghost" size="sm" onClick={async () => { const { error } = await supabase.from("projects").delete().eq("id", p.id).eq("user_id", user.id); if (error) { toast.error("Failed to delete project."); return; } queryClient.invalidateQueries({ queryKey: ["projects"] }); }}>
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
              <h3 className="text-sm font-semibold text-[#0A0A0A]">Add Experience</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Title</label>
                  <Input value={expForm.title} onChange={(e) => setExpForm({ ...expForm, title: e.target.value })} className="mt-1" placeholder="e.g. Marketing Intern" />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Company</label>
                  <Input value={expForm.company} onChange={(e) => setExpForm({ ...expForm, company: e.target.value })} className="mt-1" />
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
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Description</label>
                <Textarea value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} className="mt-1" rows={3} />
              </div>
              <Button onClick={addExperience} className="bg-[#0A0A0A] hover:bg-[#262626] text-sm">
                <Plus className="w-4 h-4 mr-2" />Add Experience
              </Button>
            </div>
            {experiences.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs uppercase tracking-wider text-[#A3A3A3] font-medium">Your Experience</h3>
                {experiences.map((e) => (
                  <div key={e.id} className="bg-white rounded-lg border border-[#E5E5E5] px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-[#0A0A0A]">{e.title} at {e.company}</p>
                      <p className="text-xs text-[#A3A3A3]">{e.type?.replace("_", " ")}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={async () => { const { error } = await supabase.from("experiences").delete().eq("id", e.id).eq("user_id", user.id); if (error) { toast.error("Failed to delete experience."); return; } queryClient.invalidateQueries({ queryKey: ["experiences"] }); }}>
                      <Trash2 className="w-4 h-4 text-[#A3A3A3] hover:text-red-500" />
                    </Button>
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