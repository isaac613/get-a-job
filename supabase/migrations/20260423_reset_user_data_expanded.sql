-- Expand reset_user_data so a full "redo onboarding" actually restores a
-- clean state. The previous version only cleared derived fields, leaving
-- skills, summary, five_year_role, etc. prefilled on re-entry (confusing UX
-- and kept the new analysis anchored to the old goal) and left cached
-- job_suggestions around.
--
-- We KEEP identity + education core so the user doesn't re-type boilerplate:
--   full_name, phone_number, location, linkedin_url, resume_url,
--   degree, field_of_study, education_level

CREATE OR REPLACE FUNCTION public.reset_user_data(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM career_roles    WHERE user_id = p_user_id;
  DELETE FROM tasks           WHERE user_id = p_user_id;
  DELETE FROM experiences     WHERE user_id = p_user_id;
  DELETE FROM projects        WHERE user_id = p_user_id;
  DELETE FROM certifications  WHERE user_id = p_user_id;
  DELETE FROM job_suggestions WHERE user_id = p_user_id;

  UPDATE profiles SET
    onboarding_complete      = false,
    onboarding_step          = 0,
    skills                   = '{}',
    summary                  = null,
    five_year_role           = null,
    primary_domain           = null,
    adjacent_fields          = '[]'::jsonb,
    proof_signals            = '[]'::jsonb,
    relevant_coursework      = '{}',
    gpa                      = null,
    honors                   = null,
    overall_assessment       = null,
    qualification_level      = null,
    skill_gaps               = '{}',
    last_reality_check_date  = null
  WHERE id = p_user_id;
END;
$function$;
