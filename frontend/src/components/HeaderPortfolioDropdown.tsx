import React from 'react';
import { Listbox, Transition } from '@headlessui/react';
import { ChevronUpDownIcon, CheckIcon } from '@heroicons/react/20/solid';
import { useQuery } from '@tanstack/react-query';
import { fetchAllPortfolioNames } from '../services/portfolioService';
import { useAuth } from '../AuthContext';

type Props = {
  selected: string | null;
  onSelect: (name: string) => void;
};

const HeaderPortfolioDropdown: React.FC<Props> = ({ selected, onSelect }) => {
  const { isLoggedIn } = useAuth();
  const { data: names = [], isLoading } = useQuery({
    queryKey: ['headerPortfolioNames', isLoggedIn],
    queryFn: fetchAllPortfolioNames,
    enabled: !!isLoggedIn,
    staleTime: 15 * 60 * 1000,
  });

  return (
    <div className="min-w-[180px]">
      <Listbox value={selected ?? ''} onChange={(v: string) => onSelect(v)} disabled={isLoading || !names.length}>
        <div className="relative">
          <Listbox.Button className={`relative w-full cursor-default rounded-md bg-gray-700 py-1.5 pl-3 pr-8 text-left text-sm text-gray-100 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500`}>
            <span className="block truncate">{selected || (isLoading ? 'Loading...' : 'Select portfolio')}</span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <ChevronUpDownIcon className="h-4 w-4 text-gray-300" aria-hidden="true" />
            </span>
          </Listbox.Button>
          <Transition leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
            <Listbox.Options className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none border border-gray-700">
              {names.map((name) => (
                <Listbox.Option
                  key={name}
                  className={({ active }) => `relative cursor-pointer select-none py-2 pl-10 pr-4 ${active ? 'bg-indigo-600 text-white' : 'text-gray-100'}`}
                  value={name}
                >
                  {({ selected: sel }) => (
                    <>
                      <span className={`block truncate ${sel ? 'font-semibold' : 'font-normal'}`}>{name}</span>
                      {sel ? (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-indigo-300">
                          <CheckIcon className="h-4 w-4" />
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
  );
};

export default HeaderPortfolioDropdown;
