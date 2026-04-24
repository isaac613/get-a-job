-- Built-in + custom CV template selection.
--
-- applications gains two columns:
--   - cv_template_id: text id of a built-in template (default "classic";
--     also includes "modern", "compact", "executive"). Resolved server-side
--     in generate-tailored-cv to a CV_TEMPLATES config entry.
--   - custom_template_id: FK to cv_templates when the user picked a PDF they
--     uploaded themselves. When set, the server reads the row, reuses its
--     cached extracted_structure (or computes it on first use), and uses
--     that to pick the base style + section order.
--
-- cv_templates stores user-uploaded PDFs as reference templates. The PDF
-- itself lives in the `cvs` storage bucket at
-- {user_id}/templates/{uuid}.pdf; the row holds metadata + a cached jsonb
-- `extracted_structure` so we don't have to re-analyse the PDF every CV gen.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS cv_template_id text DEFAULT 'classic',
  ADD COLUMN IF NOT EXISTS custom_template_id uuid;

CREATE TABLE IF NOT EXISTS public.cv_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'My Template',
  storage_path text NOT NULL,
  template_type text NOT NULL DEFAULT 'custom',
  layout_description text,
  extracted_structure jsonb,
  is_default boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cv_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cv_templates_user_crud ON public.cv_templates;
CREATE POLICY cv_templates_user_crud ON public.cv_templates
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_cv_templates_user
  ON public.cv_templates (user_id, is_default DESC, updated_at DESC);

-- FK from applications.custom_template_id → cv_templates.id. Guarded with
-- DROP IF EXISTS so re-runs don't fail on duplicate constraint names.
ALTER TABLE public.applications
  DROP CONSTRAINT IF EXISTS fk_custom_template;
ALTER TABLE public.applications
  ADD CONSTRAINT fk_custom_template
    FOREIGN KEY (custom_template_id)
    REFERENCES public.cv_templates(id)
    ON DELETE SET NULL;
