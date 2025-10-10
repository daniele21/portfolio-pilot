import React, { Dispatch, SetStateAction } from 'react';
import ActionButton from './ActionButton';

interface Props {
  open: boolean;
  mode: 'import' | 'add';
  portfolioNames: string[];
  importPortfolioName: string;
  setImportPortfolioName: Dispatch<SetStateAction<string>>;
  importText: string;
  setImportText: Dispatch<SetStateAction<string>>;
  uploadFiles: File[];
  setUploadFiles: Dispatch<SetStateAction<File[]>>;
  importing: boolean;
  importError: string | null;
  setImportError: Dispatch<SetStateAction<string | null>>;
  onClose: () => void;
  onSubmit: () => Promise<void> | void;
}

const TransactionImportModal: React.FC<Props> = ({
  open,
  mode,
  portfolioNames,
  importPortfolioName,
  setImportPortfolioName,
  importText,
  setImportText,
  uploadFiles,
  setUploadFiles,
  importing,
  importError,
  setImportError,
  onClose,
  onSubmit
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4 overflow-y-auto">
      <div className="bg-gray-900 p-8 rounded-xl shadow-2xl w-full max-w-lg my-auto mx-auto max-h-screen overflow-y-auto">
        <h2 className="text-2xl font-bold text-white mb-4">{mode === 'add' ? 'Add Transaction' : 'Import Transactions'}</h2>
        <p className="text-gray-300 mb-4">{mode === 'add' ? 'Enter a single transaction below. Select the portfolio to add it to.' : 'Paste your transactions in free text format below. This will be sent to the backend for parsing and import.'}</p>
        {mode === 'add' ? (
          <div className="mb-3">
            <label htmlFor="add-portfolio-select" className="block text-gray-200 font-semibold mb-1">Portfolio</label>
            <select
              id="add-portfolio-select"
              className="w-full p-2 rounded bg-gray-800 text-gray-100 border border-gray-700 focus:ring-2 focus:ring-indigo-500"
              value={importPortfolioName}
              onChange={e => setImportPortfolioName(e.target.value)}
              disabled={importing}
            >
              {portfolioNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        ) : (
          <input
            className="w-full mb-3 p-2 rounded bg-gray-800 text-gray-100 border border-gray-700 focus:ring-2 focus:ring-indigo-500"
            type="text"
            placeholder="Portfolio name"
            value={importPortfolioName}
            onChange={e => setImportPortfolioName(e.target.value)}
            disabled={importing}
          />
        )}

        <div className={`w-full mb-4 p-4 border-2 border-dashed rounded-lg text-center transition-colors ${uploadFiles.length > 0 ? 'ring-1 ring-indigo-500' : ''}`}>
          <p className="text-gray-300 text-sm mb-2 font-semibold">Drag & Drop transaction files (CSV, Excel, PDF, TXT)</p>
          <input
            type="file"
            multiple
            className="hidden"
            id="file-input-modal"
            onChange={e => {
              const files = Array.from(e.target.files || []);
              const accepted = files.filter(f => /\.(csv|tsv|xlsx|xls|pdf|txt|text)$/i.test(f.name));
              if (accepted.length !== files.length) {
                setImportError('Some files were skipped (unsupported type).');
              }
              setUploadFiles(prev => [...prev, ...accepted]);
            }}
            disabled={importing}
          />
          <label htmlFor="file-input-modal" className="cursor-pointer inline-block px-3 py-1 mt-1 rounded bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500">Browse Files</label>
          {uploadFiles.length > 0 && (
            <ul className="mt-3 text-left max-h-28 overflow-auto text-xs divide-y divide-gray-700 bg-gray-900 rounded-md">
              {uploadFiles.map((f, i) => (
                <li key={i} className="flex items-center justify-between px-2 py-1">
                  <span className="truncate mr-2 text-gray-300">{f.name}</span>
                  <button
                    className="text-red-400 hover:text-red-300 text-[10px]"
                    onClick={() => setUploadFiles(prev => prev.filter((_, idx) => idx !== i))}
                    disabled={importing}
                  >Remove</button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[10px] text-gray-500">Files with recognizable tabular headers skip LLM usage. Others are parsed via Gemini.</p>
        </div>

        <div className="mb-4 text-sm text-gray-300">
          <details className="bg-gray-800 p-3 rounded">
            <summary className="cursor-pointer font-semibold text-gray-100">Input format & examples</summary>
            <div className="mt-2 text-xs text-gray-300">
              <p className="mb-2">Please include the following information for each transaction (labels/names can vary):</p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  Ticker / symbol compatible with 
                  <a 
                  href="https://finance.yahoo.com/" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-indigo-400 underline hover:text-indigo-300"
                  >
                  Yahoo Finance
                  </a> 
                  (required)
                </li>
                <li>Quantity / shares (required)</li>
                <li>Price per share or total price (required if available)</li>
                <li>Date (preferably YYYY-MM-DD) (required)</li>
                <li>Action / label (e.g. Buy, Sell, Dividend) (required)
                </li>
                <li>Security/company name (optional)</li>
              </ul>
              <p className="mt-2">Accepted file types: CSV, TSV, XLSX, XLS, PDF, TXT. Tabular files with headers are parsed locally; free-form text or PDFs are sent to the parser/LLM.</p>
            </div>
          </details>
        </div>

        <textarea
          className="w-full h-36 p-3 rounded-lg bg-gray-800 text-gray-100 border border-gray-700 focus:ring-2 focus:ring-indigo-500 mb-4"
          value={importText}
          onChange={e => setImportText(e.target.value)}
          placeholder={mode === 'add' ? 'e.g. Buy 10 AAPL at $150 on 2024-01-01' : 'Optional: Paste free-form transactions text here'}
          disabled={importing}
        />
        {importError && <div className="text-red-400 mb-2">{importError}</div>}
        <div className="flex justify-end gap-2">
          <ActionButton variant="ghost" size="md" onClick={onClose} disabled={importing}>Cancel</ActionButton>
          <ActionButton variant="primary" size="md" onClick={() => onSubmit()} disabled={importing || !importPortfolioName.trim() || (!importText.trim() && uploadFiles.length === 0)}>
            {importing ? 'Processing...' : (mode === 'add' ? 'Add / Import' : 'Import')}
          </ActionButton>
        </div>
      </div>
    </div>
  );
};

export default TransactionImportModal;
