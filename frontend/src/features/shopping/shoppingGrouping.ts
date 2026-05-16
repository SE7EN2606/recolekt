import type { MergedShoppingItem } from './shoppingMerge';

export type ShoppingGroup = {
  title: string;
  items: MergedShoppingItem[];
};

const GROUPS = ['Produce', 'Meat & Fish', 'Dairy', 'Pantry', 'Spices & Condiments', 'Bakery', 'Frozen', 'Other'] as const;

function groupForName(name: string): typeof GROUPS[number] {
  const text = name.toLowerCase();
  if (/frozen|ice cream/.test(text) || (/peas|carrot/.test(text) && /frozen/.test(text))) return 'Frozen';
  if (/quark|cottage cheese|heavy cream|parmesan|shredded cheese|butter|cheese|cream|egg|feta|milk|mozzarella|yogurt/.test(text)) return 'Dairy';
  if (/beef broth|beef stock|chicken broth|vegetable broth|\bbroth\b|\bstock\b|baking powder|baking soda|flour|shelf stable gnocchi|gnocchi|whole almonds|almonds|burgundy wine|dry red wine|\bwine\b/.test(text)) return 'Pantry';
  if (/lemon juice|lime juice|worcestershire sauce|dijon mustard|mustard|salt|pepper|black pepper|red pepper flakes|curry|paprika|cumin|bay leaves?|oregano|thyme|rosemary|cinnamon|nutmeg|vanilla extract|tomato paste|soy sauce|vinegar|oil|olive oil|honey|spice|seasoning/.test(text)) return 'Spices & Condiments';
  if (/beef|chicken|cod|fish|lamb|meat|pork|salmon|sausage|shrimp|tuna|turkey/.test(text)) return 'Meat & Fish';
  if (/apple|avocado|banana|basil|berry|broccoli|carrots?|cilantro|cucumber|garlic|herb|lettuce|lemon zest|orange zest|lemon|lime|mushrooms?|onions?|parsley|potatoes|potato|spinach|tomato|zucchini/.test(text)) return 'Produce';
  if (/bagel|bread|bun|pita|tortilla/.test(text)) return 'Bakery';
  if (/bean|lentil|pasta|rice|sauce|sugar/.test(text)) return 'Pantry';
  return 'Other';
}

export function groupShoppingItems(items: MergedShoppingItem[], options: { includeExcluded?: boolean } = {}): ShoppingGroup[] {
  const grouped = new Map<string, MergedShoppingItem[]>();
  GROUPS.forEach((group) => grouped.set(group, []));

  items
    .filter((item) => options.includeExcluded || !item.excluded)
    .forEach((item) => {
      grouped.get(groupForName(item.name))!.push(item);
    });

  return GROUPS
    .map((title) => ({ title, items: grouped.get(title) || [] }))
    .filter((group) => group.items.length > 0);
}
