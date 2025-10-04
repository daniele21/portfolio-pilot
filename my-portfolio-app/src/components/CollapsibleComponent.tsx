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
    <div className="mb-4">
      <button
        type="button"
        className="relative z-10 w-full flex items-center justify-between px-4 py-2 bg-gray-700 rounded-t-lg focus:outline-none text-left text-white font-semibold text-lg hover:bg-gray-600 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500"
        onClick={() => setIsOpen(open => !open)}
        aria-expanded={isOpen}
        aria-controls={sectionId}
      >
        <span>{title}</span>
        <span
          aria-hidden="true"
          className={`transform transition-transform duration-200 ${isOpen ? '' : 'rotate-180'}`}
        >
          ▼
        </span>
      </button>
      <div
        id={sectionId}
        role="region"
        aria-labelledby={sectionId + '-label'}
        className={`${isOpen ? 'block' : 'hidden'} bg-gray-800 rounded-b-lg p-6 border-t border-gray-700`}
      >
        {children}
      </div>
    </div>
  );
};

export default CollapsibleSection;