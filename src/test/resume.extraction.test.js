import { describe, it, expect } from 'vitest';

// Replicate the extraction logic from StepResumeUpload
function extractJson(replyText) {
  const jsonMatch = replyText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let extracted = null;

  // Attempt 1: direct parse
  try { extracted = JSON.parse(jsonMatch[0]); } catch {}

  // Attempt 2: only unescape if JSON looks double-escaped
  if (!extracted && /\{\s*\\"/.test(jsonMatch[0])) {
    try {
      const unescaped = jsonMatch[0]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t');
      extracted = JSON.parse(unescaped);
    } catch {}
  }

  return extracted;
}

describe('extractJson', () => {
  it('parses clean JSON response', () => {
    const reply = 'Here is the data: {"full_name": "Isaac", "skills": ["React"]}';
    const result = extractJson(reply);
    expect(result).toEqual({ full_name: 'Isaac', skills: ['React'] });
  });

  it('returns null if no JSON found', () => {
    expect(extractJson('Sorry, I could not extract the data.')).toBeNull();
  });

  it('does not attempt unescape on clean JSON with backslashes', () => {
    // A valid JSON with a backslash in a string should not be corrupted
    const reply = '{"full_name": "Isaac", "path": "C:\\\\Users\\\\Isaac"}';
    const result = extractJson(reply);
    expect(result?.full_name).toBe('Isaac');
  });

  it('handles double-escaped JSON (unescape path)', () => {
    // Simulate LLM returning double-escaped JSON
    const doubleEscaped = '{\\"full_name\\": \\"Isaac\\", \\"skills\\": []}';
    const reply = `Here is the data: ${doubleEscaped}`;
    const result = extractJson(reply);
    expect(result?.full_name).toBe('Isaac');
  });
});
