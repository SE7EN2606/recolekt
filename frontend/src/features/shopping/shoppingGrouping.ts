import type { MergedShoppingItem } from './shoppingMerge';

export type ShoppingGroup = {
  title: string;
  items: MergedShoppingItem[];
};

const GROUPS = ['Produce', 'Meat & Fish', 'Dairy', 'Pantry', 'Spices', 'Bakery', 'Frozen', 'Other'] as const;

function groupForName(name: string): typeof GROUPS[number] {
  const text = name.toLowerCase();
  if (/apple|avocado|banana|basil|berry|broccoli|carrot|cilantro|cucumber|garlic|herb|lemon|lime|onion|parsley|pepper|potato|spinach|tomato|zucchini/.test(text)) return 'Produce';
  if (/beef|chicken|cod|fish|lamb|meat|pork|salmon|sausage|shrimp|tuna|turkey/.test(text)) return 'Meat & Fish';
  if (/butter|cheese|cream|egg|feta|milk|mozzarella|parmesan|yogurt/.test(text)) return 'Dairy';
  if (/basil|cinnamon|cumin|oregano|paprika|pepper|salt|spice|thyme/.test(text)) return 'Spices';
  if (/bagel|bread|bun|pita|tortilla/.test(text)) return 'Bakery';
  if (/frozen|ice cream|peas/.test(text)) return 'Frozen';
  if (/bean|flour|honey|lentil|oil|pasta|rice|sauce|sugar|vinegar/.test(text)) return 'Pantry';
  return 'Other';
}

export function groupShoppingItems(items: MergedShoppingItem[]): ShoppingGroup[] {
  const grouped = new Map<string, MergedShoppingItem[]>();
  GROUPS.forEach((group) => grouped.set(group, []));

  items
    .filter((item) => !item.excluded)
    .forEach((item) => {
      grouped.get(groupForName(item.name))!.push(item);
    });

  return GROUPS
    .map((title) => ({ title, items: grouped.get(title) || [] }))
    .filter((group) => group.items.length > 0);
}
