import React from 'react';
import { ReportSectionData } from '../../types';

interface FrameworkSectionsProps {
  sections: ReportSectionData[];
}

export const FrameworkSections: React.FC<FrameworkSectionsProps> = ({ sections }) => {
  if (!sections.length) return null;

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-800">体系专项解读</h3>
      {sections.map((section) => (
        <div key={section.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <h4 className="text-sm font-semibold text-slate-700">{section.title}</h4>
          {typeof section.content === 'string' ? (
            <p className="mt-2 text-sm text-slate-600 leading-6">{section.content}</p>
          ) : (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
              {section.content.map((item, index) => (
                <li key={`${section.id}-${index}`}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
};
