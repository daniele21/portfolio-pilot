import React from 'react';
import ActionButton from './ActionButton';
import { CloudArrowUpIcon, TrashIcon } from '@heroicons/react/24/outline';

interface Props {
  portfolioNames: string[];
  selectedPortfolio: string;
  onSelect: (name: string) => void;
  onImportClick: () => void;
  onDeleteClick: () => void;
}

const PortfolioToolbar: React.FC<Props> = ({ portfolioNames, selectedPortfolio, onSelect, onImportClick, onDeleteClick }) => {
  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-4 mb-6 bg-gradient-to-br from-gray-800 to-gray-850 rounded-2xl px-4 sm:px-6 py-5 shadow-lg border border-gray-700/70 backdrop-blur">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:flex-1 min-w-[200px]">
        <ActionButton variant="secondary" size="sm" className="p-2" onClick={onImportClick} title="Import transactions" aria-label="Import transactions">
          <CloudArrowUpIcon className="h-4 w-4" />
        </ActionButton>
        <span className="text-sm uppercase tracking-wider text-gray-400 font-medium">Portfolios</span>
        <ul className="flex flex-row flex-nowrap overflow-x-auto gap-2 pb-1 hide-scrollbar">
          {portfolioNames.map(name => {
            const active = name === selectedPortfolio;
            return (
              <li key={name} className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors shadow-sm border ${active ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-gray-700/70 text-gray-200 border-gray-600 hover:bg-gray-700'} cursor-pointer`} onClick={() => onSelect(name)} tabIndex={0} role="button" title={`Select portfolio ${name}`} aria-current={active ? 'true' : 'false'}>
                {name}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex items-center gap-2 sm:ml-4">
        <label htmlFor="portfolio-select" className="text-base text-gray-200 font-semibold">Select:</label>
        <select id="portfolio-select" className="px-3 py-2 rounded-lg bg-gray-900/80 text-white border border-gray-600 focus:ring-2 focus:ring-indigo-500 text-sm font-medium shadow-inner" value={selectedPortfolio} onChange={e => onSelect(e.target.value)}>
          {portfolioNames.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <ActionButton variant="danger" size="sm" className="p-2" onClick={onDeleteClick} title="Delete this portfolio and all its transactions">
          <TrashIcon className="h-4 w-4" />
        </ActionButton>
      </div>
    </div>
  );
};

export default PortfolioToolbar;
