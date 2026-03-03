import { API_BASE } from "../utils/api";
type AnyObj = Record<string, any>;

export function safeStr(v: any): string {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  return String(v);
}

// ✅ Extract English from dual-language objects
export function extractEnglish(value: any): string {
  if (!value) return '';
  
  // If it's already a string, return it
  if (typeof value === 'string') return value;
  
  // If it's an object with english/original, prefer english
  if (typeof value === 'object') {
    if (value.english) return safeStr(value.english);
    if (value.original) return safeStr(value.original);
  }
  
  return safeStr(value);
}

export function dedupeBullets(items: Array<{ headline?: string | any; text?: string | any; emoji?: string }>) {
  const seen = new Set<string>();
  const out: Array<{ headline: string; text: string; emoji?: string }> = [];

  for (const b of items || []) {
    // ✅ Handle dual-language for both headline and text
    const headline = extractEnglish(b?.headline).trim();
    const text = extractEnglish(b?.text).trim();
    
    if (!headline && !text) continue;

    const key = `${headline.toLowerCase()}|${text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      headline: headline || 'Highlight',
      text,
      emoji: safeStr(b?.emoji).trim() || undefined,
    });
  }

  return out;
}

export function pickFirstString(...vals: any[]): string {
  for (const v of vals) {
    const s = extractEnglish(v).trim();
    if (s) return s;
  }
  return '';
}

export function getBullets(v: AnyObj) {
  // ✅ NEW: Check summary_text first (new backend format)
  const summaryText = v?.summary_text;
  if (summaryText) {
    const englishHeadlines = summaryText?.english?.headlines || summaryText?.english?.highlights;
    const originalHeadlines = summaryText?.original?.headlines || summaryText?.original?.highlights;
    
    if (Array.isArray(englishHeadlines) && englishHeadlines.length > 0) {
      return dedupeBullets(englishHeadlines);
    }
    if (Array.isArray(originalHeadlines) && originalHeadlines.length > 0) {
      return dedupeBullets(originalHeadlines);
    }
  }

  // ✅ Fallback: Try multiple possible paths
  const candidates =
    v?.summary?.headlines ??
    v?.summary?.highlights ??
    v?.headlines ??
    v?.highlights ??
    v?.summary?.bullets ??
    v?.summary_bullets ??
    [];

  // ✅ Parse if it's a JSON string
  let arr: any[] = [];
  if (typeof candidates === 'string') {
    try {
      arr = JSON.parse(candidates);
    } catch {
      arr = [];
    }
  } else if (Array.isArray(candidates)) {
    arr = candidates;
  }

  return dedupeBullets(arr);
}

export function getDescription(v: AnyObj) {
  // ✅ Try summary_text first (new backend format)
  const summaryText = v?.summary_text;
  if (summaryText) {
    const englishSummary = summaryText?.english?.summary;
    const originalSummary = summaryText?.original?.summary;
    
    if (englishSummary) return safeStr(englishSummary).trim();
    if (originalSummary) return safeStr(originalSummary).trim();
  }

  // ✅ Fallback: Try multiple possible paths
  const result = pickFirstString(
    v?.summary?.summary,
    v?.summary_text,
    v?.ai_analysis?.summary,
    v?.ai_analysis_summary,
    v?.summary_summary,
    v?.analysis?.summary,
    v?.analysis_summary,
    v?.aiSummary,
    v?.description
  );
  
  return result;
}

export function getTitle(v: AnyObj) {
  // ✅ Try summary_text first
  const summaryText = v?.summary_text;
  if (summaryText) {
    const englishTitle = summaryText?.english?.title;
    const originalTitle = summaryText?.original?.title;
    
    if (englishTitle) return safeStr(englishTitle).trim();
    if (originalTitle) return safeStr(originalTitle).trim();
  }

  // ✅ Fallback
  return pickFirstString(
    v?.summary?.title, 
    v?.summary_title, 
    v?.summarytitle, 
    v?.title, 
    'Untitled'
  );
}

export function getTopic(v: AnyObj) {
  return pickFirstString(
    v?.summary?.topic, 
    v?.summary_topic, 
    v?.summarytopic, 
    v?.topic, 
    ''
  );
}

export function getCategory(v: AnyObj) {
  return pickFirstString(
    v?.summary?.category, 
    v?.summary_category, 
    v?.summarycategory, 
    v?.category, 
    'General'
  );
}

export function getHashtags(v: AnyObj) {
  // ✅ Try summary_text first
  const summaryText = v?.summary_text;
  if (summaryText) {
    const englishHashtags = summaryText?.english?.hashtags;
    const originalHashtags = summaryText?.original?.hashtags;
    
    if (Array.isArray(englishHashtags) && englishHashtags.length > 0) {
      return englishHashtags.map((t: string) => safeStr(t).replace(/^#/, '').trim()).filter(Boolean);
    }
    if (Array.isArray(originalHashtags) && originalHashtags.length > 0) {
      return originalHashtags.map((t: string) => safeStr(t).replace(/^#/, '').trim()).filter(Boolean);
    }
  }

  // ✅ Fallback
  const raw = v?.summary?.hashtags ?? v?.summary_hashtags ?? v?.summaryhashtags ?? v?.hashtags ?? [];
  const tags = Array.isArray(raw) ? raw : [];
  return tags.map((t: string) => safeStr(t).replace(/^#/, '').trim()).filter(Boolean);
}

export function sanitizeServings(servings: any): number {
  const num = parseInt(String(servings), 10);
  if (isNaN(num) || num <= 0) return 1;
  if (num > 50) return 12;
  return num;
}

export function parseQuantity(qty: string): { val: string; unit: string } {
  if (!qty) return { val: '', unit: '' };
  
  const trimmed = qty.trim();
  const match = trimmed.match(/^([\d\.\,\/\s]+)(.*)$/);
  
  if (match && /\d/.test(match[1])) {
    return { 
      val: match[1].trim(),
      unit: match[2].trim()
    };
  }

  return { val: trimmed, unit: '' };
}

export function convertToMetric(quantity: string): string {
  const conversions: Record<string, { unit: string; factor: number }> = {
    'cup': { unit: 'ml', factor: 240 },
    'cups': { unit: 'ml', factor: 240 },
    'tablespoon': { unit: 'ml', factor: 15 },
    'tablespoons': { unit: 'ml', factor: 15 },
    'tbsp': { unit: 'ml', factor: 15 },
    'teaspoon': { unit: 'ml', factor: 5 },
    'teaspoons': { unit: 'ml', factor: 5 },
    'tsp': { unit: 'ml', factor: 5 },
    'ounce': { unit: 'g', factor: 28.35 },
    'ounces': { unit: 'g', factor: 28.35 },
    'oz': { unit: 'g', factor: 28.35 },
    'pound': { unit: 'g', factor: 453.6 },
    'pounds': { unit: 'g', factor: 453.6 },
    'lb': { unit: 'g', factor: 453.6 },
    'lbs': { unit: 'g', factor: 453.6 },
  };

  const { val, unit } = parseQuantity(quantity);
  
  if (!val || !unit) return quantity;
  
  const lowerUnit = unit.toLowerCase();
  const conversion = conversions[lowerUnit];
  
  if (!conversion) return quantity;
  
  let numValue = 0;
  const parts = val.split(/\s+/);
  
  for (const part of parts) {
    if (part.includes('/')) {
      const [numerator, denominator] = part.split('/').map(Number);
      numValue += numerator / denominator;
    } else {
      numValue += parseFloat(part) || 0;
    }
  }
  
  const converted = numValue * conversion.factor;
  const rounded = converted >= 100 ? Math.round(converted) : Math.round(converted * 10) / 10;
  
  return `${rounded} ${conversion.unit}`;
}

export function scaleQuantity(quantity: string, scale: number): string {
  if (!quantity) return quantity;
  if (scale === 1) return quantity;

  const { val, unit } = parseQuantity(quantity);
  
  if (!val) return quantity;
   
  let numValue = 0;
  const parts = val.split(/\s+/);
  
  for (const part of parts) {
    if (part.includes('/')) {
      const [numerator, denominator] = part.split('/').map(Number);
      numValue += numerator / denominator;
    } else {
      numValue += parseFloat(part) || 0;
    }
  }
  
  const scaled = numValue * scale;
  const formatted = scaled % 1 === 0 ? scaled : scaled.toFixed(1);
  
  return `${formatted} ${unit}`.trim();
}
