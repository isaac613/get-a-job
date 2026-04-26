import { describe, it, expect } from 'vitest';

// Replicate the cleanProfilePayload logic for testing
function cleanProfilePayload(data) {
  const {
    full_name, phone_number, location, linkedin_url, summary, skills,
    degree, field_of_study, education_level, gpa, honors, relevant_coursework, resume_url,
    onboarding_step, onboarding_complete,
    skill_gaps, qualification_level, overall_assessment, last_reality_check_date
  } = data;
  return {
    full_name, phone_number, location, linkedin_url, summary, skills,
    degree, field_of_study, education_level, gpa, honors, relevant_coursework, resume_url,
    onboarding_step, onboarding_complete,
    skill_gaps, qualification_level, overall_assessment, last_reality_check_date
  };
}

describe('cleanProfilePayload', () => {
  it('strips unknown fields not in the profiles table schema', () => {
    const input = {
      full_name: 'Isaac',
      hard_skills: ['Excel'],
      tools_software: ['Figma'],
      five_year_role: 'CTO',
      employment_status: ['employed'],
    };
    const result = cleanProfilePayload(input);
    expect(result).not.toHaveProperty('hard_skills');
    expect(result).not.toHaveProperty('tools_software');
    expect(result).not.toHaveProperty('five_year_role');
    expect(result).not.toHaveProperty('employment_status');
  });

  it('preserves all known profile fields', () => {
    const input = {
      full_name: 'Isaac',
      email: 'i@example.com',
      phone_number: '07700000000',
      location: 'London',
      linkedin_url: 'https://linkedin.com/in/isaac',
      summary: 'Software engineer',
      skills: ['React', 'TypeScript'],
      degree: 'BSc',
      field_of_study: 'Computer Science',
      education_level: 'bachelors',
      gpa: '3.8',
      honors: ['First Class'],
      relevant_coursework: ['Algorithms'],
      resume_url: 'https://example.com/cv.pdf',
      onboarding_step: 4,
      onboarding_complete: false,
      skill_gaps: ['Docker'],
      qualification_level: 'Junior',
      overall_assessment: 'Strong candidate',
      last_reality_check_date: '2026-03-22',
    };
    const result = cleanProfilePayload(input);
    expect(result.full_name).toBe('Isaac');
    expect(result.skills).toEqual(['React', 'TypeScript']);
    expect(result.onboarding_step).toBe(4);
    expect(result.skill_gaps).toEqual(['Docker']);
  });

  it('does not mutate the input object', () => {
    const input = { full_name: 'Isaac', hard_skills: ['Excel'] };
    const original = { ...input };
    cleanProfilePayload(input);
    expect(input).toEqual(original);
  });

  it('returns undefined for fields not present in the input', () => {
    const result = cleanProfilePayload({ full_name: 'Isaac' });
    expect(result.full_name).toBe('Isaac');
    expect(result.phone_number).toBeUndefined();
  });
});
