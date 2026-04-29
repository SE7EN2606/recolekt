// src/components/ListSubtypeLabel.tsx
import {
  Wrench,
  Sparkles,
  Backpack,
  UtensilsCrossed,
  Trophy,
  Heart,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type ListSubtype = 'software' | 'lifestyle' | 'gear' | 'food' | 'ranking' | 'picks';

const LIST_SUBTYPE_ICON: Record<ListSubtype, React.ElementType> = {
  software:  Wrench,
  lifestyle: Sparkles,
  gear:      Backpack,
  food:      UtensilsCrossed,
  ranking:   Trophy,
  picks:     Heart,
};

export function ListSubtypeLabel({ subtype }: { subtype: ListSubtype }) {
  const { t } = useTranslation('videoDetail');
  const Icon = LIST_SUBTYPE_ICON[subtype] ?? Heart;
  const label = t(`listSubtype.${subtype}`, { defaultValue: subtype });

  return (
    <div className="flex items-center gap-1.5 text-primary-700">
      <Icon size={14} />
      <span className="text-xs font-black uppercase tracking-widest">{label}</span>
    </div>
  );
}
