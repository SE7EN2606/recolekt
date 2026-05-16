"""
unit_converter.py
Normalizes recipe ingredient units to user's preferred measurement system.
Operates on a copy — never mutates original extracted recipe data.
Only converts mass-to-mass and volume-to-volume. Never volume-to-weight.
"""

from typing import Optional

_MASS_TO_GRAMS = {
    "g": 1.0, "gram": 1.0, "grams": 1.0,
    "kg": 1000.0, "kilogram": 1000.0, "kilograms": 1000.0,
    "oz": 28.3495, "ounce": 28.3495, "ounces": 28.3495,
    "lb": 453.592, "lbs": 453.592, "pound": 453.592, "pounds": 453.592,
}

_VOLUME_TO_ML = {
    "ml": 1.0, "milliliter": 1.0, "milliliters": 1.0,
    "millilitre": 1.0, "millilitres": 1.0,
    "cl": 10.0, "centiliter": 10.0, "centiliters": 10.0,
    "dl": 100.0, "deciliter": 100.0, "deciliters": 100.0,
    "l": 1000.0, "liter": 1000.0, "liters": 1000.0,
    "litre": 1000.0, "litres": 1000.0,
    "tsp": 4.929, "teaspoon": 4.929, "teaspoons": 4.929,
    "tbsp": 14.787, "tablespoon": 14.787, "tablespoons": 14.787,
    "fl oz": 29.574, "fluid ounce": 29.574, "fluid ounces": 29.574,
    "cup": 236.588, "cups": 236.588,
    "pint": 473.176, "pints": 473.176, "pt": 473.176,
    "quart": 946.353, "quarts": 946.353, "qt": 946.353,
    "gallon": 3785.41, "gallons": 3785.41, "gal": 3785.41,
}

_METRIC_MASS_OUTPUT   = [(1000.0, "kg"), (1.0, "g")]
_METRIC_VOLUME_OUTPUT = [(1000.0, "l"), (100.0, "dl"), (1.0, "ml")]
_US_MASS_OUTPUT       = [(453.592, "lb"), (28.3495, "oz")]
_US_VOLUME_OUTPUT     = [(946.353, "qt"), (473.176, "pint"), (236.588, "cup"), (14.787, "tbsp"), (4.929, "tsp")]

VALID_SYSTEMS = {"metric", "us", "imperial"}


def _smart_round(value: float) -> str:
    if value >= 100:
        return str(round(value))
    if value >= 10:
        return str(round(value, 1)).rstrip("0").rstrip(".")
    return str(round(value, 2)).rstrip("0").rstrip(".")


def _pick_output_unit(value_in_base: float, output_table: list) -> tuple:
    for threshold, unit in output_table:
        if value_in_base >= threshold * 0.9:
            return value_in_base / threshold, unit
    threshold, unit = output_table[-1]
    return value_in_base / threshold, unit


def normalize_ingredient_units(
    quantity: Optional[str],
    unit: Optional[str],
    system: str = "metric",
) -> tuple:
    """
    Convert a single quantity+unit into the target system.
    Returns (quantity_str, unit_str) — unchanged if unit is unrecognized.
    """
    if not quantity or not unit:
        return quantity, unit

    unit_lower = unit.lower().strip()
    system_lower = (system or "metric").lower().strip()
    if system_lower not in VALID_SYSTEMS:
        system_lower = "metric"

    try:
        qty_float = float(str(quantity).replace(",", "."))
    except (ValueError, TypeError):
        return quantity, unit

    if unit_lower in _MASS_TO_GRAMS:
        grams = qty_float * _MASS_TO_GRAMS[unit_lower]
        table = _METRIC_MASS_OUTPUT if system_lower == "metric" else _US_MASS_OUTPUT
        value, out_unit = _pick_output_unit(grams, table)
        return _smart_round(value), out_unit

    if unit_lower in _VOLUME_TO_ML:
        ml = qty_float * _VOLUME_TO_ML[unit_lower]
        table = _METRIC_VOLUME_OUTPUT if system_lower == "metric" else _US_VOLUME_OUTPUT
        value, out_unit = _pick_output_unit(ml, table)
        return _smart_round(value), out_unit

    return quantity, unit


def normalize_ingredients_list(ingredients: list, system: str = "metric") -> list:
    """
    Normalize all ingredients in a recipe list to the target system.
    Only processes ingredients with quantity_type in ("exact", "estimated").
    Stores originals in _original_quantity / _original_unit.
    Never mutates the input list.
    """
    result = []
    for ing in (ingredients or []):
        qty_type = ing.get("quantity_type", "unspecified")
        qty = ing.get("quantity")
        unit = ing.get("unit")
        if qty_type in ("exact", "estimated") and qty and unit:
            norm_qty, norm_unit = normalize_ingredient_units(qty, unit, system)
            result.append({
                **ing,
                "quantity": norm_qty,
                "unit": norm_unit,
                "_original_quantity": qty,
                "_original_unit": unit,
            })
        else:
            result.append(dict(ing))
    return result
