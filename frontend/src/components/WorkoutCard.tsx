// fetcher_app/src/components/WorkoutCard.tsx
import React from 'react';
import { Clock, Activity, Flame, Dumbbell, Lightbulb } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  workoutData: any;
  showOriginal: boolean;
}

export const WorkoutCard: React.FC<Props> = ({ workoutData, showOriginal }) => {
  const { t } = useTranslation('videoDetail');

  const active = workoutData?.english || workoutData?.original
    ? (showOriginal
        ? (workoutData.original ?? workoutData.english)
        : (workoutData.english ?? workoutData))
    : workoutData;

  if (!active || Object.keys(active).length === 0) return null;

  return (
    <div className="bg-white border border-gray-100 rounded-[24px] shadow-sm overflow-hidden mt-4 mb-6">

      {/* Header */}
      <div className="bg-orange-100/60 p-4 md:p-5 border-b border-gray-50 flex items-center gap-3">
        <Dumbbell className="text-orange-600" size={20} />
        <h3 className="font-bold text-gray-900 text-lg">
          {t('workoutDetails', 'Workout Plan')}
        </h3>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 divide-x divide-gray-50 border-b border-gray-50">
        {(
          [
            { icon: <Clock size={16} className="text-orange-500 mb-1" />,    label: t('time', 'Duration'), val: active.duration },
            { icon: <Activity size={16} className="text-orange-500 mb-1" />, label: t('format', 'Format'),   val: active.format   },
            { icon: <Flame size={16} className="text-orange-500 mb-1" />,    label: t('level', 'Level'),    val: active.level    },
          ] as { icon: React.ReactNode; label: string; val: string }[]
        ).map(({ icon, label, val }) => (
          <div key={label} className="p-4 flex flex-col items-center justify-center text-center gap-1">
            {icon}
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</span>
            <span className="text-sm font-bold text-gray-900">{val}</span>
          </div>
        ))}
      </div>

      {/* Equipment */}
      {active.equipment?.length > 0 && (
        <div className="p-6 border-b border-gray-50">
          <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">
            {t('equipment', 'Equipment')}
          </h4>
          <div className="flex flex-wrap gap-2">
            {active.equipment.map((eq: string, i: number) => (
              <div key={i} className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-bold">
                {eq}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exercises */}
      {active.groups?.length > 0 && (
        <div className="p-6 bg-gray-50/30">
          <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">
            {t('exercises', 'Exercises')}
          </h4>
          <div className="space-y-6">
            {active.groups.map((group: any, idx: number) => (
              <div key={idx} className="relative">
                {idx > 0 && (
                  <div className="absolute -top-3 left-0 right-0 border-t border-dashed border-gray-200" />
                )}
                {group.title && (
                  <h5 className="font-bold text-gray-900 text-sm bg-white border border-gray-200 shadow-sm inline-block px-3 py-1.5 rounded-lg mb-4">
                    {group.title}
                  </h5>
                )}
                <ul className="space-y-4">
                  {group.items?.map((item: any, i: number) => {
                    const info = (item.info || '')
                      .replace(/min(?:ute)?s?/i, '')
                      .replace(/×/g, '×')
                      .replace(/-/g, '–')
                      .trim();
                    return (
                      <li key={i} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-black flex-shrink-0 mt-[0.1rem]">
                          {i + 1}
                        </div>
                        <div className="text-sm font-medium text-gray-600 leading-relaxed pt-[2px] flex flex-wrap items-baseline flex-1">
                          {info && (
                            <span className="text-orange-600 font-bold mr-2">{info}</span>
                          )}
                          <span className="text-gray-900 font-bold">{item.name}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tips */}
      {active.tips?.length > 0 && (
        <div className="bg-yellow-50/50 border-t border-yellow-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="text-yellow-600" size={18} />
            <h4 className="text-xs font-black text-yellow-700 uppercase tracking-widest">
              {t('trainerTips', 'Coach Tips')}
            </h4>
          </div>
          <ul className="space-y-2">
            {active.tips.map((tip: string, i: number) => (
              <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                <span className="text-yellow-500 font-bold text-lg leading-none w-6 flex justify-center flex-shrink-0 mt-0.5">
                  •
                </span>
                <span className="italic flex-1 pt-[1px]">{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
};
