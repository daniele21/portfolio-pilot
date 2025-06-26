import React, { Fragment } from 'react';
import { Listbox, Transition } from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid';

export interface MultiSelectListboxProps<T> {
  /** Array of option items */
  options: T[];
  /** Currently selected option values */
  value: string[];
  /** Callback when selection changes */
  onChange: (selected: string[]) => void;
  /** Render the display label for an option */
  renderLabel: (option: T) => string;
  /** Extract the option's unique value (string) */
  getValue: (option: T) => string;
  /** Placeholder text when no selection */
  placeholder?: string;
  /** Additional className for dropdown button */
  buttonClassName?: string;
  /** Additional className for listbox options */
  optionsClassName?: string;
  /** Maximum number of chips to display before collapsing into count */
  maxDisplayCount?: number;
  /** CSS class for max-width constraint on the button */
  maxWidthClassName?: string;
}

/**
 * A generic multi-select dropdown using HeadlessUI Listbox.
 * Displays selected options as horizontally scrollable chips up to a max count; over that, shows "N items selected".
 */
function MultiSelectListbox<T>({
  options,
  value,
  onChange,
  renderLabel,
  getValue,
  placeholder = 'Select...',
  buttonClassName = '',
  optionsClassName = '',
  maxDisplayCount = 3,
  maxWidthClassName = 'max-w-xs'
}: MultiSelectListboxProps<T>) {
  const selectedOptions = options.filter(opt => value.includes(getValue(opt)));
  const tooMany = selectedOptions.length > maxDisplayCount;

  return (
    <Listbox value={value} onChange={onChange} multiple>
      <div className="relative">
        <Listbox.Button
          className={`relative w-full ${maxWidthClassName} cursor-pointer rounded-lg bg-gray-700 py-2 pl-3 pr-10 text-left text-gray-200 shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-opacity-75 text-sm ${buttonClassName}`}
        >
          {value.length === 0 ? (
            <span className="block truncate">{placeholder}</span>
          ) : tooMany ? (
            <span className="block">{`${selectedOptions.length} items selected`}</span>
          ) : (
            <div className="flex items-center space-x-1 overflow-x-auto whitespace-nowrap pr-8">
              {selectedOptions.map(opt => {
                const val = getValue(opt);
                return (
                  <span key={val} className="inline-flex items-center bg-indigo-600 text-white rounded px-2 py-0.5 text-xs font-medium truncate">
                    {renderLabel(opt)}
                  </span>
                );
              })}
            </div>
          )}
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
            <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
          </span>
        </Listbox.Button>
        <Transition
          as={Fragment}
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Listbox.Options
            className={`absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-gray-800 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm ${optionsClassName}`}
          >
            {options.map(opt => {
              const val = getValue(opt);
              return (
                <Listbox.Option
                  key={val}
                  value={val}
                  className={({ active }) =>
                    `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                      active ? 'bg-indigo-600 text-white' : 'text-gray-200'
                    }`
                  }
                >
                  {({ selected }) => (
                    <>
                      <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>{renderLabel(opt)}</span>
                      {selected && (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-indigo-400">
                          <CheckIcon className="h-5 w-5" aria-hidden="true" />
                        </span>
                      )}
                    </>
                  )}
                </Listbox.Option>
              );
            })}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  );
}

export default MultiSelectListbox;
