/**
 * Readability scoring utilities (Flesch-Kincaid approximation).
 *
 * These work on plain text (strip HTML first). The formulas are:
 *
 *   Flesch Reading Ease = 206.835 − 1.015 × (words / sentences) − 84.6 × (syllables / words)
 *   Flesch-Kincaid Grade = 0.39 × (words / sentences) + 11.8 × (syllables / words) − 15.59
 */

/** Naive syllable counter for English text. */
function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;

  let count = 0;
  const vowels = 'aeiouy';
  let prevVowel = false;

  for (let i = 0; i < w.length; i++) {
    const isVowel = vowels.includes(w[i]);
    if (isVowel && !prevVowel) count++;
    prevVowel = isVowel;
  }

  // Silent e at end
  if (w.endsWith('e') && count > 1) count--;
  // -le ending counts
  if (w.endsWith('le') && w.length > 2 && !vowels.includes(w[w.length - 3])) count++;

  return Math.max(1, count);
}

/** Strip HTML tags to get plain text. */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

export function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export function countSentences(text: string): number {
  const matches = text.match(/[.!?]+/g);
  return Math.max(1, matches ? matches.length : 1);
}

export function totalSyllables(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.reduce((sum, w) => sum + countSyllables(w), 0);
}

export interface ReadabilityResult {
  /** Flesch Reading Ease (0–100+, higher = easier) */
  fleschReadingEase: number;
  /** Flesch-Kincaid Grade Level */
  gradeLevel: number;
  /** Human-friendly label */
  label: string;
  /** Score mapped to 0–100 for UI */
  score: number;
}

export function computeReadability(text: string): ReadabilityResult {
  const words = countWords(text);
  if (words < 10) {
    return { fleschReadingEase: 0, gradeLevel: 0, label: 'Too short', score: 0 };
  }

  const sentences = countSentences(text);
  const syllables = totalSyllables(text);

  const fre = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
  const grade = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;

  let label: string;
  if (fre >= 80) label = 'Very Easy';
  else if (fre >= 60) label = 'Easy';
  else if (fre >= 40) label = 'Moderate';
  else if (fre >= 20) label = 'Difficult';
  else label = 'Very Difficult';

  // Map FRE to 0–100 score (clip)
  const score = Math.max(0, Math.min(100, Math.round(fre)));

  return {
    fleschReadingEase: Math.round(fre * 10) / 10,
    gradeLevel: Math.round(grade * 10) / 10,
    label,
    score,
  };
}

export function keywordDensity(text: string, keyword: string): number {
  const k = keyword.trim();
  const w = countWords(text);
  if (!k || w === 0) return 0;
  const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
  const matches = text.match(re);
  return ((matches ? matches.length : 0) / w) * 100;
}

export function lengthScore(wordCount: number): number {
  return Math.max(0, Math.min(100, Math.round((wordCount / 1200) * 100)));
}
