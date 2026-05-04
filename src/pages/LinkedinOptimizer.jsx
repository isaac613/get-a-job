import React, { useState, useMemo } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Loader2, Copy, Check, Linkedin, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// LinkedIn Optimizer v1 — Wk 3.
//
// Generation-first (no PDF upload, no visual mirror — those are v2).
// Single LLM call returns 6 sections in a structured JSON. Each section
// renders as a card with the generated text + character count vs LinkedIn's
// actual limit + Copy button. User pastes section-by-section into LinkedIn
// manually.
//
// State lives in component memory only — no DB persistence in v1
// (encourages iteration; backlog item if pilot signal warrants).

const LIMITS = {
  headline: 220,
  about: 2600,
  experience_desc: 2000,
  volunteering_desc: 2000,
  military_desc: 2000,
  honor_desc: 200,
};

function CharCount({ value, max }) {
  const len = value?.length || 0;
  const pct = (len / max) * 100;
  const color = pct > 100 ? "text-red-600" : pct > 90 ? "text-amber-600" : "text-[#A3A3A3]";
  return <span className={`text-[11px] ${color}`}>{len} / {max}</span>;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Select the text manually.");
    }
  };
  return (
    <button
      onClick={handle}
      className="text-[11px] font-medium text-[#525252] hover:text-[#0A0A0A] inline-flex items-center gap-1"
    >
      {copied ? (
        <><Check className="w-3 h-3 text-emerald-600" /> Copied</>
      ) : (
        <><Copy className="w-3 h-3" /> Copy</>
      )}
    </button>
  );
}

function SectionCard({ title, text, max, footer, children }) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E5E5] p-5 mb-4">
      <div className="flex items-center justify-between mb-2 gap-3">
        <h3 className="text-sm font-semibold text-[#0A0A0A]">{title}</h3>
        <div className="flex items-center gap-3 flex-shrink-0">
          {max != null && <CharCount value={text} max={max} />}
          {text && <CopyButton text={text} />}
        </div>
      </div>
      {children}
      {footer && <p className="text-[11px] text-[#A3A3A3] mt-2">{footer}</p>}
    </div>
  );
}

function TextBlock({ text, placeholder }) {
  if (!text) return <p className="text-xs text-[#A3A3A3] italic">{placeholder}</p>;
  return <pre className="text-sm text-[#0A0A0A] whitespace-pre-wrap font-sans leading-relaxed">{text}</pre>;
}

export default function LinkedinOptimizer() {
  const { user } = useAuth();
  const [content, setContent] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    if (generating || !user?.id) return;
    setError(null);
    setGenerating(true);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke("generate-linkedin-content", {
        body: {},
      });
      if (invokeErr) {
        const status = invokeErr?.context?.status;
        if (status === 429) {
          setError("Rate limit reached (30 generations/hour). Try again in a bit.");
        } else if (status === 404) {
          setError("No profile found. Complete onboarding first.");
        } else {
          setError(invokeErr.message || "Generation failed. Please try again.");
        }
        return;
      }
      if (!data?.headline) {
        setError("AI returned an unexpected response. Please try again.");
        return;
      }
      setContent(data);
    } catch (err) {
      console.error("LinkedIn generation error:", err);
      setError("Couldn't reach the AI service. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const expLabels = content?.experience_labels || {};

  // Compute total chars across all sections for the header summary
  const totalChars = useMemo(() => {
    if (!content) return 0;
    let n = (content.headline?.length || 0) + (content.about?.length || 0);
    for (const e of (content.experiences || [])) n += e.description?.length || 0;
    for (const v of (content.volunteering || [])) n += v.description?.length || 0;
    for (const m of (content.military || [])) n += m.description?.length || 0;
    for (const h of (content.honors || [])) n += h.description?.length || 0;
    return n;
  }, [content]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0A0A0A] flex items-center gap-2">
            <Linkedin className="w-5 h-5 text-[#0A66C2]" />
            LinkedIn Optimizer
          </h1>
          <p className="text-sm text-[#A3A3A3] mt-1">
            Generates LinkedIn-formatted content for 6 sections from your profile + Story Bank.
            Each section becomes copy-paste-ready for LinkedIn.
          </p>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={generating}
          className="bg-[#0A0A0A] hover:bg-[#262626] text-sm flex-shrink-0"
        >
          {generating ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</>
          ) : content ? (
            <><RefreshCw className="w-4 h-4 mr-2" />Regenerate</>
          ) : (
            <>Generate</>
          )}
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {!content && !generating && !error && (
        <div className="bg-white rounded-xl border border-[#E5E5E5] p-8 text-center">
          <Linkedin className="w-8 h-8 text-[#A3A3A3] mx-auto mb-3" />
          <p className="text-sm text-[#525252] mb-1">
            Click <strong>Generate</strong> to create LinkedIn content from your profile + Story Bank.
          </p>
          <p className="text-xs text-[#A3A3A3]">
            6 sections: Headline, About, Experience descriptions, Volunteering descriptions, Skills priority,
            and Honors & Awards descriptions.
          </p>
          <p className="text-[11px] text-[#A3A3A3] mt-3 italic">
            Generation takes ~20–30s. Story Bank entries supply real metrics; nothing is fabricated.
          </p>
        </div>
      )}

      {generating && (
        <div className="bg-white rounded-xl border border-[#E5E5E5] p-8 text-center">
          <Loader2 className="w-6 h-6 text-[#525252] mx-auto mb-3 animate-spin" />
          <p className="text-sm text-[#525252]">Generating 6 sections — this takes 20-30 seconds.</p>
          <p className="text-[11px] text-[#A3A3A3] mt-2">
            Reading your profile, experiences, and {/* approximate */}stories…
          </p>
        </div>
      )}

      {content && (
        <>
          <p className="text-[11px] text-[#A3A3A3] mb-4">
            Total: ~{totalChars.toLocaleString()} chars across all sections. Copy each section individually
            and paste into LinkedIn's edit fields.
          </p>

          <SectionCard title="Headline" text={content.headline} max={LIMITS.headline}>
            <TextBlock text={content.headline} placeholder="No headline generated." />
          </SectionCard>

          <SectionCard
            title="About"
            text={content.about}
            max={LIMITS.about}
            footer="Paste into LinkedIn's About section. First paragraph shows above the fold; structure accordingly."
          >
            <TextBlock text={content.about} placeholder="No about generated." />
          </SectionCard>

          {content.experiences?.length > 0 && (
            <div className="mt-6 mb-2">
              <h2 className="text-xs uppercase tracking-wider text-[#A3A3A3] font-medium">
                Experience descriptions ({content.experiences.length})
              </h2>
            </div>
          )}
          {content.experiences?.map((e) => (
            <SectionCard
              key={e.experience_id}
              title={expLabels[e.experience_id] || "Experience"}
              text={e.description}
              max={LIMITS.experience_desc}
            >
              <TextBlock text={e.description} placeholder="No description generated." />
            </SectionCard>
          ))}

          {content.volunteering?.length > 0 && (
            <div className="mt-6 mb-2">
              <h2 className="text-xs uppercase tracking-wider text-[#A3A3A3] font-medium">
                Volunteering descriptions ({content.volunteering.length})
              </h2>
            </div>
          )}
          {content.volunteering?.map((v) => (
            <SectionCard
              key={v.experience_id}
              title={expLabels[v.experience_id] || "Volunteering"}
              text={v.description}
              max={LIMITS.volunteering_desc}
            >
              <TextBlock text={v.description} placeholder="No description generated." />
            </SectionCard>
          ))}

          {content.military?.length > 0 && (
            <div className="mt-6 mb-2">
              <h2 className="text-xs uppercase tracking-wider text-[#A3A3A3] font-medium">
                Military service ({content.military.length})
                <span className="text-[#A3A3A3] normal-case font-normal ml-1">— civilian-readable framing for recruiters</span>
              </h2>
            </div>
          )}
          {content.military?.map((mil) => (
            <SectionCard
              key={mil.experience_id}
              title={expLabels[mil.experience_id] || "Military service"}
              text={mil.description}
              max={LIMITS.military_desc}
            >
              <TextBlock text={mil.description} placeholder="No description generated." />
            </SectionCard>
          ))}

          <SectionCard
            title={`Skills priority (${content.skills_priority?.length || 0} skills, top 3 highlighted)`}
            text={(content.skills_priority || []).map((s) => s.skill).join("\n")}
            max={null}
            footer="LinkedIn's first 3 skills get the 'Top skills' highlight. Reorder your LinkedIn skills section to match this priority."
          >
            {!content.skills_priority?.length ? (
              <p className="text-xs text-[#A3A3A3] italic">No skills generated.</p>
            ) : (
              <ol className="space-y-1.5 text-sm">
                {content.skills_priority.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className={`text-[11px] font-mono w-6 flex-shrink-0 ${i < 3 ? 'text-amber-700 font-semibold' : 'text-[#A3A3A3]'}`}>
                      {i + 1}.
                    </span>
                    <div className="min-w-0">
                      <span className={`${i < 3 ? 'font-semibold text-[#0A0A0A]' : 'text-[#525252]'}`}>{s.skill}</span>
                      {s.rationale && (
                        <p className="text-[11px] text-[#A3A3A3] leading-snug">{s.rationale}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>

          {content.honors?.length > 0 && (
            <div className="mt-6 mb-2">
              <h2 className="text-xs uppercase tracking-wider text-[#A3A3A3] font-medium">
                Honors & Awards ({content.honors.length})
              </h2>
            </div>
          )}
          {content.honors?.map((h, i) => (
            <SectionCard
              key={i}
              title={h.name}
              text={h.description}
              max={LIMITS.honor_desc}
              footer={!h.description ? "No source-grounded description available — paste the award title alone, or add your own context (the AI won't invent the awarding committee's reasoning)." : null}
            >
              {h.description
                ? <TextBlock text={h.description} placeholder="No description generated." />
                : <p className="text-sm text-[#A3A3A3] italic">(blank — by design)</p>}
            </SectionCard>
          ))}
        </>
      )}
    </div>
  );
}
