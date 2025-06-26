import React, { useState, ReactNode, FC } from 'react';

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
        className="w-full flex items-center justify-between px-4 py-2 bg-gray-700 rounded-t-lg focus:outline-none text-left text-white font-semibold text-lg hover:bg-gray-600 transition-colors"
        onClick={() => setIsOpen(open => !open)}
        aria-expanded={isOpen}
        aria-controls={sectionId}
      >
        <span>{title}</span>
        <span className={`transform transition-transform duration-200 ${isOpen ? '' : 'rotate-180'}`}>▼</span>
      </button>
      {isOpen && (
        <div
          id={sectionId}
          className="bg-gray-800 rounded-b-lg p-6 border-t border-gray-700"
        >
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapsibleSection;