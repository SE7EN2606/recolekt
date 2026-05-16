import React from 'react';
import { Check } from 'lucide-react';

type Props = {
  index: number;
  raw: any;
  checked: boolean;
  onToggle: (i: number) => void;
  parseInstruction: (raw: any) => {
    text: string;
    isInferred: boolean;
  };
};

const StepRow: React.FC<Props> = ({
  index,
  raw,
  checked,
  onToggle,
  parseInstruction,
}) => {
  const { text, isInferred } = parseInstruction(raw);

  return (
    <div
      onClick={() => onToggle(index)}
      className={`flex items-start gap-3.5 cursor-pointer select-none transition-all group ${
        checked ? 'opacity-40' : ''
      }`}
    >
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all ${
          checked
            ? 'bg-emerald-600 border-2 border-emerald-600'
            : 'bg-white border-2 border-primary-200 group-hover:border-primary-400'
        }`}
      >
        {checked ? (
          <Check size={12} className="text-white" strokeWidth={3} />
        ) : (
          <span className="text-[11px] font-black text-primary-600">
            {index + 1}
          </span>
        )}
      </div>

      <div className="flex-1 pt-[4px]">
        <p
          className={`text-[13px] leading-relaxed ${
            checked ? 'text-gray-300' : 'text-gray-600 font-medium'
          }`}
        >
          {isInferred && !checked && (
            <span className="text-gray-300 select-none mr-0.5">~</span>
          )}

          {text}
        </p>
      </div>
    </div>
  );
};

export default StepRow;
