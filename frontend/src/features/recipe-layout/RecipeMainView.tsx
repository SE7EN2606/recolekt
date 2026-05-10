import React from 'react';

type Props = {
  hero?: React.ReactNode;
  primary?: React.ReactNode;
  secondary?: React.ReactNode;
  inspect?: React.ReactNode;
  cook?: React.ReactNode;
};

export default function RecipeMainView({
  hero,
  primary,
  secondary,
  inspect,
  cook,
}: Props) {
  return (
    <div className="space-y-0">
      {hero && (
        <section>
          {hero}
        </section>
      )}

      {primary && (
        <section>
          {primary}
        </section>
      )}

      {secondary && (
        <section className="border-t border-gray-100 bg-gray-50/40">
          {secondary}
        </section>
      )}

      {inspect && (
        <details className="border-t border-gray-100">
          <summary className="cursor-pointer px-5 py-4 text-xs font-black uppercase tracking-widest text-gray-400">
            Recipe Details
          </summary>

          <div className="px-5 py-5 bg-gray-50/30">
            {inspect}
          </div>
        </details>
      )}

      {cook && (
        <section className="border-t border-gray-100">
          {cook}
        </section>
      )}
    </div>
  );
}
