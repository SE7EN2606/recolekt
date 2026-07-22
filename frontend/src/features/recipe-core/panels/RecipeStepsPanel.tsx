import React from 'react';
import { RawInstruction } from '../types';
import { convertTemperatureInText } from '../../../utils/conversionUtils';

type InstructionSection = {
  title?: string;
  instructions: RawInstruction[];
};

type Props = {
  instructionSections: InstructionSection[];
  checkedSteps: Set<number>;
  toggleStep: (index: number) => void;
  temperatureUnit?: 'celsius' | 'fahrenheit';
  markerColumnWidth: string;
  markerSize: number;
  bodyClass: string;
  lineFree?: boolean;
};

function getInstructionText(raw: RawInstruction): string {
  if (typeof raw === 'string') return raw.trim();

  const obj = raw as any;

  return String(
    obj?.instruction ??
    obj?.text ??
    obj?.step ??
    obj?.description ??
    obj?.body ??
    ''
  ).trim();
}

const RecipeStepsPanel: React.FC<Props> = ({
  instructionSections,
  checkedSteps,
  toggleStep,
  temperatureUnit = 'celsius',
  markerColumnWidth,
  markerSize,
  bodyClass,
  lineFree = false,
}) => {
  let globalIndex = 0;

  return (
    <div className={`${lineFree ? 'space-y-6' : 'space-y-5'} ${bodyClass}`}>
      {instructionSections.map((section, sectionIndex) => {
        const visibleInstructions = (section.instructions || [])
          .map((instruction) => ({
            raw: instruction,
            text: convertTemperatureInText(getInstructionText(instruction), temperatureUnit),
          }))
          .filter((item) => item.text.length > 0);

        if (visibleInstructions.length === 0) return null;

        return (
          <div key={sectionIndex} className="space-y-4">
            {section.title && (
              <h4 className="text-[11px] font-black uppercase tracking-widest text-gray-400">
                {section.title}
              </h4>
            )}

            <div className={lineFree ? 'space-y-4' : 'space-y-0'}>
              {visibleInstructions.map(({ text }) => {
                const stepIndex = globalIndex++;
                const checked = checkedSteps.has(stepIndex);

                return (
                  <button
                    key={`${sectionIndex}-${stepIndex}-${text.slice(0, 24)}`}
                    type="button"
                    onClick={() => toggleStep(stepIndex)}
                    style={{ gridTemplateColumns: `${markerColumnWidth} minmax(0, 1fr)` }}
                    className={`grid w-full items-start gap-x-3 text-left transition-all ${
                      lineFree
                        ? 'rounded-2xl px-0 py-0'
                        : 'border-b border-gray-100 px-0 py-3.5 last:border-b-0'
                    } ${
                      checked
                        ? 'opacity-80'
                        : 'hover:bg-transparent'
                    }`}
                  >
                    <div
                      style={{ width: markerSize, height: markerSize }}
                      className={`flex items-center justify-center justify-self-center rounded-[7px] transition-all ${
                        checked
                          ? 'bg-gradient-to-br from-primary-600 to-secondary-600 text-white shadow-sm'
                          : 'bg-gradient-to-br from-primary-100 to-secondary-100 text-primary-700'
                      }`}
                    >
                      <span className={`text-[10px] font-black`}>
                        {stepIndex + 1}
                      </span>
                    </div>

                    <div className="min-w-0 self-center">
                      <p
                        className={`text-[14.5px] ${lineFree ? 'leading-relaxed' : 'leading-[1.6]'} font-medium ${
                          checked ? 'text-gray-400 line-through' : 'text-gray-700'
                        }`}
                      >
                        {text}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default RecipeStepsPanel;
