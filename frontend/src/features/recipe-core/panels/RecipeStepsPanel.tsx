import React from 'react';
import StepRow from '../rows/StepRow';
import { RawInstruction } from '../types';

type Props = {
  instructionSections: { title?: string; instructions: RawInstruction[] }[];
  checkedSteps: Set<number>;
  toggleStep: (i: number) => void;
};

const RecipeStepsPanel: React.FC<Props> = ({
  instructionSections,
  checkedSteps,
  toggleStep,
}) => {
  return (
    <div className="space-y-5">
      {(() => {
        let offset = 0;
        return instructionSections.map((section, sectionIndex) => {
          const startIndex = offset;
          offset += section.instructions.length;

          return (
            <div key={`${section.title || 'section'}-${sectionIndex}`} className={sectionIndex > 0 ? 'pt-2 border-t border-gray-50' : ''}>
              {section.title && (
                <h5 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">
                  {section.title}
                </h5>
              )}
              <div className="space-y-5">
                {section.instructions.map((step, stepIndex) => {
                  const absoluteIndex = startIndex + stepIndex;
                  return (
                    <StepRow
                      parseInstruction={(r) => r}
                      key={absoluteIndex}
                      index={absoluteIndex}
                      raw={step}
                      checked={checkedSteps.has(absoluteIndex)}
                      onToggle={toggleStep}
                    />
                  );
                })}
              </div>
            </div>
          );
        });
      })()}
    </div>
  );
};

export default RecipeStepsPanel;
