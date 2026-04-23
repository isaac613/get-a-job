-- Add goal-alignment columns to career_roles and update the replace_career_roles RPC
-- to populate them alongside the existing reasoning + action_items columns.

ALTER TABLE career_roles
  ADD COLUMN IF NOT EXISTS goal_alignment_score numeric,
  ADD COLUMN IF NOT EXISTS alignment_reason text;

CREATE OR REPLACE FUNCTION public.replace_career_roles(p_user_id uuid, p_roles jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM career_roles WHERE user_id = p_user_id;

  IF jsonb_array_length(p_roles) > 0 THEN
    INSERT INTO career_roles (
      user_id, title, tier, match_score, readiness_score, goal_alignment_score,
      matched_skills, missing_skills, skills_gap,
      alignment_to_goal, alignment_reason, reasoning, action_items
    )
    SELECT
      p_user_id,
      (r->>'title')::text,
      (r->>'tier')::text,
      (r->>'match_score')::numeric,
      (r->>'readiness_score')::numeric,
      NULLIF(r->>'goal_alignment_score','')::numeric,
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(r->'matched_skills', '[]'::jsonb))),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(r->'missing_skills', '[]'::jsonb))),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(r->'skills_gap',     '[]'::jsonb))),
      COALESCE(r->>'alignment_to_goal', ''),
      COALESCE(r->>'alignment_reason', ''),
      COALESCE(r->>'reasoning', ''),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(r->'action_items', '[]'::jsonb)))
    FROM jsonb_array_elements(p_roles) AS r;
  END IF;
END;
$function$;
