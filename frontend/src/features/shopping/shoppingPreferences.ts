export type UnitPreference = 'metric' | 'us' | 'imperial';

export type ShoppingPreferences = {
  unitPreference: UnitPreference;
  showSecondaryMeasures: boolean;
};

const STORAGE_KEY = 'recolekt.shopping.preferences.v1';

export const DEFAULT_SHOPPING_PREFERENCES: ShoppingPreferences = {
  unitPreference: 'metric',
  showSecondaryMeasures: true,
};

export function readShoppingPreferences(): ShoppingPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SHOPPING_PREFERENCES;
    const parsed = JSON.parse(raw);
    const unitPreference = ['metric', 'us', 'imperial'].includes(parsed?.unitPreference)
      ? parsed.unitPreference
      : DEFAULT_SHOPPING_PREFERENCES.unitPreference;

    return {
      unitPreference,
      showSecondaryMeasures: typeof parsed?.showSecondaryMeasures === 'boolean'
        ? parsed.showSecondaryMeasures
        : DEFAULT_SHOPPING_PREFERENCES.showSecondaryMeasures,
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
    // Local preference only; ignore storage failures.
  }
}
