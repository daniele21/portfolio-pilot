import React from 'react';
import { Listbox, Transition } from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid';

type Props = {
  portfolioNames: string[];
  selectedPortfolio: string | null;
  setSelectedPortfolio: (v: string | null) => void;
  loading?: boolean;
  placeholder?: string;
};

const PortfolioSelector: React.FC<Props> = ({ portfolioNames, selectedPortfolio, setSelectedPortfolio, loading, placeholder = 'Choose client portfolio...' }) => {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-0">
      <div className="flex items-center gap-3">
        <label className="text-gray-300 text-base font-semibold" htmlFor="portfolio-select">Portfolio:</label>
        <div className="min-w-[220px]">
          <Listbox
            value={selectedPortfolio ?? ''}
            onChange={(v: string) => setSelectedPortfolio(v || null)}
            disabled={loading || !portfolioNames.length}
          >
            <div className="relative overflow-visible">
              <Listbox.Button className={`relative w-full cursor-default rounded-lg bg-gray-700 py-2 pl-3 pr-10 text-left border border-gray-600 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm min-h-[44px] ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
                id="portfolio-select"
              >
                {selectedPortfolio || <span className="text-gray-400">{placeholder}</span>}
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                  <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                </span>
              </Listbox.Button>
              <Transition leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
                <Listbox.Options className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md bg-gray-800 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm border border-gray-700">
                  {portfolioNames.map((name) => (
                    <Listbox.Option
                      key={name}
                      className={({ active }) =>
                        `relative cursor-pointer select-none py-2 pl-10 pr-4 ${active ? 'bg-indigo-600 text-white' : 'text-gray-100'}`
                      }
                      value={name}
                    >
                      {({ selected }) => (
                        <>
                          <span className={`block truncate ${selected ? 'font-semibold' : 'font-normal'}`}>{name}</span>
                          {selected ? (
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-indigo-300">
                              <CheckIcon className="h-5 w-5" aria-hidden="true" />
                            </span>
                          ) : null}
                        </>
                      )}
                    </Listbox.Option>
                  ))}
                </Listbox.Options>
              </Transition>
            </div>
          </Listbox>
        </div>
      </div>
      {loading && (
        <span className="text-gray-400 text-sm ml-2">Loading client portfolios...</span>
      )}
    </div>
  );
};

export default PortfolioSelector;
