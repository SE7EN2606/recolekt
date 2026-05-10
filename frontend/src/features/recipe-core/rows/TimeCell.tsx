import React from 'react';

type Props = {
  icon: React.ReactNode;
  label: string;
  value: string | null;
};

const TimeCell: React.FC<Props> = ({
  icon,
  label,
  value,
}) => {
  if (!value) return null;

  return (
    <div className="flex flex-col items-center justify-center gap-1 py-4 px-2 text-center">
      <div className="text-rose-500">{icon}</div>

      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
        {label}
      </span>

      <span className="text-[13px] font-black text-rose-600 leading-tight">
        {value}
      </span>
    </div>
  );
};

export default TimeCell;
