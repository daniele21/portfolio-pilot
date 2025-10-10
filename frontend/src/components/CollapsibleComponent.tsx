import { useState, type ReactNode, type FC } from 'react';

export interface CollapsibleSectionProps {
  /** Section title shown in header */
  title: string;
  /** Content to show/hide */
  children: ReactNode;
  /** Whether the section is open by default */
  defaultOpen?: boolean;
}

const CollapsibleSection: FC<CollapsibleSectionProps> = ({ title, children, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const sectionId = `collapsible-${title.replace(/\s+/g, '-')}`;

  return (
    <div className="mb-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-lg">
      <button
        type="button"
        className="relative z-10 w-full flex items-center justify-between px-6 py-4 bg-gradient-to-r from-white/5 to-white/10 hover:from-white/10 hover:to-white/15 focus:outline-none text-left text-white font-semibold text-lg transition-all duration-200 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
        onClick={() => setIsOpen(open => !open)}
        aria-expanded={isOpen}
        aria-controls={sectionId}
      >
        <span className="flex items-center gap-3">
          <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          {title}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 hidden sm:block">
            {isOpen ? 'Collapse' : 'Expand'}
          </span>
          <svg
            aria-hidden="true"
            className={`w-5 h-5 text-slate-300 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      <div
        id={sectionId}
        role="region"
        aria-labelledby={sectionId + '-label'}
        className={`transition-all duration-300 ease-in-out ${
          isOpen 
            ? 'max-h-[2000px] opacity-100' 
            : 'max-h-0 opacity-0 overflow-hidden'
        }`}
      >
        <div className="border-t border-white/10">
          {children}
        </div>
      </div>
    </div>
  );
};

export default CollapsibleSection;