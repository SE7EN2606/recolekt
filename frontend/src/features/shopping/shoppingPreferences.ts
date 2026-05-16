export type UnitPreference = 'metric' | 'us' | 'imperial';
export type TemperatureUnit = 'celsius' | 'fahrenheit';
export type VolumePreference = 'metric' | 'us';
export type RecipeConversion = 'do_not_convert' | 'always' | 'smart';
export type RoundingMode = 'rounded' | 'exact';

export type ShoppingPreferences = {
  unitPreference: UnitPreference;
  showSecondaryMeasures: boolean;
  temperatureUnit: TemperatureUnit;
  volumePreference: VolumePreference;
  recipeConversion: RecipeConversion;
  rounding: RoundingMode;
};

const STORAGE_KEY = 'rekolekt.shopping.preferences.v2';

export const DEFAULT_SHOPPING_PREFERENCES: ShoppingPreferences = {
  unitPreference: 'metric',
  showSecondaryMeasures: true,
  temperatureUnit: 'celsius',
  volumePreference: 'metric',
  recipeConversion: 'do_not_convert',
  rounding: 'rounded',
};

export function readShoppingPreferences(): ShoppingPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SHOPPING_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      unitPreference: ['metric', 'us', 'imperial'].includes(parsed?.unitPreference)
        ? parsed.unitPreference : DEFAULT_SHOPPING_PREFERENCES.unitPreference,
      showSecondaryMeasures: typeof parsed?.showSecondaryMeasures === 'boolean'
        ? parsed.showSecondaryMeasures : DEFAULT_SHOPPING_PREFERENCES.showSecondaryMeasures,
      temperatureUnit: ['celsius', 'fahrenheit'].includes(parsed?.temperatureUnit)
        ? parsed.temperatureUnit : DEFAULT_SHOPPING_PREFERENCES.temperatureUnit,
      volumePreference: ['metric', 'us'].includes(parsed?.volumePreference)
        ? parsed.volumePreference : DEFAULT_SHOPPING_PREFERENCES.volumePreference,
      recipeConversion: ['do_not_convert', 'always', 'smart'].includes(parsed?.recipeConversion)
        ? parsed.recipeConversion : DEFAULT_SHOPPING_PREFERENCES.recipeConversion,
      rounding: ['rounded', 'exact'].includes(parsed?.rounding)
        ? parsed.rounding : DEFAULT_SHOPPING_PREFERENCES.rounding,
    };
  } catch {
    return DEFAULT_SHOPPING_PREFERENCES;
  }
}

export function saveShoppingPreferences(preferences: ShoppingPreferences) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    window.dispatchEvent(new CustomEvent('recolekt:shopping-preferences-changed', {
      detail: preferences,
    }));
  } catch {
    // ignore
  }
}
