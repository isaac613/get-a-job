import React, { useState, useRef } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Upload, Trash2, Star, FileText } from "lucide-react";
import { toast } from "sonner";

// Client-side PDF text extraction. pdfjs-dist is already a project dependency;
// we use its legacy build to get text content without needing a worker. We
// extract the first ~4000 chars and ship them to OpenAI for structure
// analysis. The result is cached on the cv_templates row so we don't re-parse
// on every CV generation.
async function extractPdfText(file) {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Disable the worker for simplicity in-browser — fine for single-file parses.
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "";
  } catch { /* ignore */ }
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf, disableWorker: true }).promise;
  let text = "";
  const maxPages = Math.min(pdf.numPages, 3);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(" ") + "\n\n";
    if (text.length > 5000) break;
  }
  return text.slice(0, 5000);
}

// Structure extraction via OpenAI. The server reuses this cached JSON when
// the user picks this template. Returns null on any failure — the caller
// then saves a row with extracted_structure = null and the server will
// fall back to a built-in template.
async function analyseTemplateStructure(pdfText) {
  try {
    const { data, error } = await supabase.functions.invoke("ai-chat", {
      body: {
        message:
          `Analyse this CV template text. Return JSON only with these exact fields:\n` +
          `- sections: string[] — the CV sections in the order they appear, each one of: about, experience, education, skills, languages, honors, certifications, projects, volunteering, military, references\n` +
          `- font_style: "serif" | "sans-serif" — the apparent font family\n` +
          `- density: "compact" | "normal" | "spacious" — the layout density\n\n` +
          `TEMPLATE TEXT:\n${pdfText}`,
        agent: "resume-extractor",
        conversation_history: [],
      },
    });
    if (error || !data?.reply) return null;
    const match = String(data.reply).match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch (err) {
    console.warn("Template structure analysis failed:", err);
    return null;
  }
}

export default function TemplateManager({ onClose }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["cvTemplates", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("cv_templates")
        .select("*")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["cvTemplates", user?.id] });

  const handleUpload = async (file) => {
    if (!file || !user?.id) return;
    if (file.type !== "application/pdf") {
      toast.error("Please upload a .pdf file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("PDF is larger than 10 MB.");
      return;
    }
    setUploading(true);
    try {
      const id = crypto.randomUUID();
      const storagePath = `${user.id}/templates/${id}.pdf`;

      const { error: upErr } = await supabase.storage
        .from("cvs")
        .upload(storagePath, file, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (upErr) throw upErr;

      // Client-side structure extraction. On failure we still create the
      // row with extracted_structure=null — the server will fall back to a
      // built-in template when rendering.
      let extractedStructure = null;
      try {
        const pdfText = await extractPdfText(file);
        if (pdfText.trim().length > 200) {
          extractedStructure = await analyseTemplateStructure(pdfText);
        }
      } catch (err) {
        console.warn("PDF parsing failed — uploading without structure:", err);
      }

      const { error: insErr } = await supabase.from("cv_templates").insert({
        id,
        user_id: user.id,
        name: file.name.replace(/\.pdf$/i, "").slice(0, 80) || "My Template",
        storage_path: storagePath,
        template_type: "custom",
        extracted_structure: extractedStructure,
      });
      if (insErr) throw insErr;

      toast.success("Template uploaded");
      invalidate();
    } catch (err) {
      console.error("Template upload failed:", err);
      toast.error(err?.message || "Upload failed");
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSetDefault = async (id) => {
    if (!user?.id) return;
    // Clear any existing default, then set this one.
    await supabase.from("cv_templates")
      .update({ is_default: false })
      .eq("user_id", user.id);
    const { error } = await supabase.from("cv_templates")
      .update({ is_default: true })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Default template set");
    invalidate();
  };

  const handleRename = async (id) => {
    const name = renameValue.trim();
    if (!name) { setRenamingId(null); return; }
    const { error } = await supabase.from("cv_templates")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) { toast.error(error.message); return; }
    setRenamingId(null);
    invalidate();
  };

  const handleDelete = async (tpl) => {
    if (!confirm(`Delete "${tpl.name}"? This can't be undone.`)) return;
    // Delete the storage object best-effort, then the DB row.
    try {
      await supabase.storage.from("cvs").remove([tpl.storage_path]);
    } catch { /* ignore — row delete is the user-visible action */ }
    const { error } = await supabase.from("cv_templates")
      .delete()
      .eq("id", tpl.id)
      .eq("user_id", user.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Template deleted");
    invalidate();
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[#0A0A0A]">Your Templates</h3>
        <p className="text-xs text-[#A3A3A3] mt-1">
          Upload a CV PDF you'd like future CVs to resemble. Structure and style cues will be used when generating.
        </p>
      </div>

      <div className="border-2 border-dashed border-[#E5E5E5] rounded-xl p-6 text-center hover:border-[#D4D4D4] transition-colors">
        <Upload className="w-5 h-5 mx-auto text-[#A3A3A3] mb-2" />
        <p className="text-sm text-[#525252] mb-1">Upload a .pdf template</p>
        <p className="text-xs text-[#A3A3A3] mb-3">Max 10 MB</p>
        <label className="inline-flex">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-xs"
          >
            {uploading ? (<><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Uploading…</>) : (<><Plus className="w-3.5 h-3.5 mr-1" />Choose PDF</>)}
          </Button>
        </label>
      </div>

      {isLoading ? (
        <div className="py-6 text-center text-xs text-[#A3A3A3]">
          <Loader2 className="w-4 h-4 animate-spin mx-auto" />
        </div>
      ) : templates.length === 0 ? (
        <p className="text-xs text-[#A3A3A3] text-center py-2">No templates yet. Upload one above.</p>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className={
                "bg-white rounded-lg border px-3 py-2.5 flex items-center gap-3 " +
                (t.is_default ? "border-[#0A0A0A] ring-1 ring-[#0A0A0A]" : "border-[#E5E5E5]")
              }
            >
              <FileText className="w-4 h-4 text-[#525252] flex-shrink-0" />
              <div className="min-w-0 flex-1">
                {renamingId === t.id ? (
                  <Input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRename(t.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(t.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="h-7 text-xs"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => { setRenamingId(t.id); setRenameValue(t.name || ""); }}
                    className="text-sm text-[#0A0A0A] truncate hover:underline text-left"
                  >
                    {t.name}
                  </button>
                )}
                <p className="text-[10px] text-[#A3A3A3]">
                  Uploaded {new Date(t.created_at).toLocaleDateString()}
                  {t.is_default && " · Default"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleSetDefault(t.id)}
                title={t.is_default ? "Default template" : "Set as default"}
                className={
                  "p-1.5 rounded hover:bg-[#F5F5F5] " +
                  (t.is_default ? "text-amber-500" : "text-[#A3A3A3] hover:text-amber-500")
                }
              >
                <Star className="w-4 h-4" fill={t.is_default ? "currentColor" : "none"} />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(t)}
                className="p-1.5 rounded hover:bg-red-50 text-[#A3A3A3] hover:text-red-500"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {onClose && (
        <div className="flex justify-end pt-2">
          <Button type="button" size="sm" variant="outline" onClick={onClose} className="text-xs">
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
