export const parseQuantity = (qty: string) => {
  if (!qty) return { val: '', unit: '' };
  
  // Clean up string
  const clean = qty.trim().replace(/,/g, '.'); // Handle "1,5" as "1.5"
  
  // 1. Try to find a known unit
  const knownUnits = [
    'cup', 'cups', 'c',
    'tablespoon', 'tablespoons', 'tbsp', 'tbs',
    'teaspoon', 'teaspoons', 'tsp',
    'ounce', 'ounces', 'oz',
    'pound', 'pounds', 'lb', 'lbs',
    'gram', 'grams', 'g',
    'kilogram', 'kilograms', 'kg',
    'milliliter', 'milliliters', 'ml',
    'liter', 'liters', 'l',
    'pinch', 'pinches',
    'slice', 'slices',
    'clove', 'cloves'
  ];
  
  // Regex: Start with number (fraction/decimal), optional space, then unit word boundary
  // Capture groups: 1=Number, 2=Unit, 3=Rest
  const unitPattern = new RegExp(`^([\\d\\.\\/\\s]+)\\s*(${knownUnits.join('|')})\\b(.*)`, 'i');
  
  const strictMatch = clean.match(unitPattern);
  
  if (strictMatch) {
    return { 
      val: strictMatch[1].trim(), 
      unit: strictMatch[2].toLowerCase() 
    };
  }

  // 2. Fallback: Just split number and text
  const simpleMatch = clean.match(/^([\d\.\/\s]+)(.*)$/);
  if (simpleMatch && /\d/.test(simpleMatch[1])) {
    // If the "rest" looks like a unit (short word), treat it as unit
    const potentialUnit = simpleMatch[2].trim().split(' ')[0].toLowerCase();
    if (potentialUnit.length <= 3 && !/\d/.test(potentialUnit)) {
       return { val: simpleMatch[1].trim(), unit: potentialUnit };
    }
    return { val: simpleMatch[1].trim(), unit: '' };
  }

  return { val: '', unit: '' };
};

export const evalFraction = (val: string): number => {
  let numValue = 0;
  // Handle "1 1/2" or "1/2"
  const parts = val.trim().split(/\s+/);
  
  for (const part of parts) {
    if (part.includes('/')) {
      const [num, den] = part.split('/').map(Number);
      if (den && den !== 0) numValue += num / den;
    } else {
      numValue += parseFloat(part) || 0;
    }
  }
  return numValue;
};

const formatConvertedValue = (value: number, rounding: 'rounded' | 'exact'): string => {
  if (!Number.isFinite(value)) return '';
  if (rounding === 'exact') return Number(value.toFixed(2)).toString();
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
};

export const convertToImperial = (
  quantity: string,
  rounding: 'rounded' | 'exact' = 'rounded'
): string => {
  const conversions: Record<string, { unit: string; factor: number }> = {
    'ml': { unit: 'cups', factor: 1 / 240 },
    'l': { unit: 'cups', factor: 1 / 0.24 },
    'g': { unit: 'oz', factor: 1 / 28.35 },
    'kg': { unit: 'lbs', factor: 2.20462 },
  };

  const { val, unit } = parseQuantity(quantity);
  if (!val || !unit) return quantity;
  
  const conv = conversions[unit];
  if (!conv) return quantity;

  const numValue = evalFraction(val);
  const converted = numValue * conv.factor;
  
  let rounded;
  if (conv.unit === 'cups') {
     rounded = rounding === 'exact' ? Number(converted.toFixed(2)) : Math.round(converted * 4) / 4;
  } else {
     rounded = rounding === 'exact'
       ? Number(converted.toFixed(2))
       : converted >= 10 ? Math.round(converted) : Math.round(converted * 10) / 10;
  }
  
  return `${rounded} ${conv.unit}`;
};

export const convertToMetric = (
  quantity: string,
  rounding: 'rounded' | 'exact' = 'rounded'
): string => {
  const conversions: Record<string, { unit: string; factor: number }> = {
    'cup': { unit: 'ml', factor: 240 }, 'cups': { unit: 'ml', factor: 240 },
    'tablespoon': { unit: 'ml', factor: 15 }, 'tbsp': { unit: 'ml', factor: 15 },
    'teaspoon': { unit: 'ml', factor: 5 }, 'tsp': { unit: 'ml', factor: 5 },
    'ounce': { unit: 'g', factor: 28.35 }, 'ounces': { unit: 'g', factor: 28.35 }, 'oz': { unit: 'g', factor: 28.35 },
    'pound': { unit: 'g', factor: 453.6 }, 'lb': { unit: 'g', factor: 453.6 },
  };
  
  const { val, unit } = parseQuantity(quantity);
  if (!val || !unit) return quantity;
  const conv = conversions[unit];
  if (!conv) return quantity;

  const numValue = evalFraction(val);
  const converted = numValue * conv.factor;
  const rounded = rounding === 'exact' ? formatConvertedValue(converted, rounding) : String(Math.round(converted));
  return `${rounded} ${conv.unit}`;
};

export const scaleQuantity = (quantity: string, scale: number): string => {
  if (scale === 1) return quantity;
  const { val, unit } = parseQuantity(quantity);
  if (!val) return quantity;
  const numValue = evalFraction(val);
  const scaled = numValue * scale;
  
  // Format nicely (remove trailing zeros)
  const formatted = parseFloat(scaled.toFixed(2)).toString();
  return `${formatted} ${unit}`.trim();
};
const celsiusToFahrenheit = (celsius: string): number =>
  Math.round(parseFloat(celsius) * 9 / 5 + 32);

const fahrenheitToCelsius = (fahrenheit: string): number =>
  Math.round((parseFloat(fahrenheit) - 32) * 5 / 9);

export const convertTemperatureInText = (text: string, targetUnit: 'celsius' | 'fahrenheit'): string => {
  let result = String(text || '');
  const numberPattern = '-?\\d+(?:\\.\\d+)?';

  if (targetUnit === 'celsius') {
    result = result.replace(
      new RegExp(`(${numberPattern})\\s*°?\\s*C\\s*\\(\\s*(${numberPattern})\\s*°?\\s*F\\s*\\)`, 'gi'),
      (_match, c) => `${Math.round(parseFloat(c))}°C`
    );
    result = result.replace(
      new RegExp(`(${numberPattern})\\s*°?\\s*F\\s*\\(\\s*(${numberPattern})\\s*°?\\s*C\\s*\\)`, 'gi'),
      (_match, _f, c) => `${Math.round(parseFloat(c))}°C`
    );
    result = result.replace(new RegExp(`(${numberPattern})\\s*°?\\s*F\\b`, 'gi'), (_match, f) => (
      `${fahrenheitToCelsius(f)}°C`
    ));
    result = result.replace(new RegExp(`(${numberPattern})\\s*°?\\s*C\\b`, 'gi'), (_match, c) => (
      `${Math.round(parseFloat(c))}°C`
    ));
  } else {
    result = result.replace(
      new RegExp(`(${numberPattern})\\s*°?\\s*C\\s*\\(\\s*(${numberPattern})\\s*°?\\s*F\\s*\\)`, 'gi'),
      (_match, _c, f) => `${Math.round(parseFloat(f))}°F`
    );
    result = result.replace(
      new RegExp(`(${numberPattern})\\s*°?\\s*F\\s*\\(\\s*(${numberPattern})\\s*°?\\s*C\\s*\\)`, 'gi'),
      (_match, f) => `${Math.round(parseFloat(f))}°F`
    );
    result = result.replace(new RegExp(`(${numberPattern})\\s*°?\\s*C\\b`, 'gi'), (_match, c) => (
      `${celsiusToFahrenheit(c)}°F`
    ));
    result = result.replace(new RegExp(`(${numberPattern})\\s*°?\\s*F\\b`, 'gi'), (_match, f) => (
      `${Math.round(parseFloat(f))}°F`
    ));
  }

  return result.replace(/\s{2,}/g, ' ').trim();
};
