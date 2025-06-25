import React, { useState, useCallback } from 'react';
import { DocumentArrowUpIcon, Cog8ToothIcon, CheckCircleIcon, ExclamationCircleIcon, ArrowPathIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { processAndApplyMovements, resetPortfolioDataToMocks, initialLoad as initialPortfolioLoad } from '../services/portfolioService';
import { ProcessMovementsResult, StandardizedMovement } from '../types';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary';


interface FeedbackState {
  type: 'success' | 'error' | 'info';
  message: string;
  skippedNotes?: string[];
  processedMovementsList?: StandardizedMovement[];
}

const SettingsPage: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setFeedback(null); 
    } else {
      setSelectedFile(null);
    }
  };

  const handleSubmitMovements = useCallback(async () => {
    if (!isLoggedIn) {
        setFeedback({ type: 'error', message: 'Please sign in to process and save movements.' });
        return;
    }
    if (!selectedFile) {
      setFeedback({ type: 'error', message: 'Please select a file first.' });
      return;
    }

    setIsProcessing(true);
    setFeedback(null);

    try {
      const fileContent = await selectedFile.text();
      const result: ProcessMovementsResult = await processAndApplyMovements(fileContent);

      if (result.success) {
        let messageType: 'success' | 'info' = 'success';
        if (result.movementsSkipped && result.movementsSkipped > 0 && result.movementsProcessed === 0 && (!result.successfullyProcessedMovements || result.successfullyProcessedMovements.length === 0)) {
          messageType = 'info'; 
        } else if (result.movementsSkipped && result.movementsSkipped > 0) {
          messageType = 'info'; 
        }
        
        setFeedback({ 
            type: messageType, 
            message: result.message,
            skippedNotes: result.notes,
            processedMovementsList: result.successfullyProcessedMovements
        });
        
        // After successful processing and POSTing to backend, trigger a refresh and navigate
        await initialPortfolioLoad(); // This re-fetches from backend
        // navigate('/'); // Optionally navigate to home to see updated portfolio

        setSelectedFile(null); 
        const fileInput = document.getElementById('movements-file-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';

      } else {
        setFeedback({ type: 'error', message: `${result.message}${result.error ? ` Details: ${result.error}` : ''}` });
      }
    } catch (error) {
      console.error("Error processing movements file:", error);
      setFeedback({ type: 'error', message: `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFile, isLoggedIn, navigate]);

  const handleResetData = async () => {
     if (!isLoggedIn) {
        setFeedback({ type: 'error', message: 'Please sign in to reset data.' });
        return;
    }
    setIsResetting(true);
    setFeedback(null);
    try {
        // This function now primarily clears local session state.
        // The backend would need its own mechanism for clearing if that's desired.
        await resetPortfolioDataToMocks(true); 
        await initialPortfolioLoad(); // Re-fetch from (potentially empty) backend
        setFeedback({ type: 'success', message: 'Local session data cleared. Portfolio view will refresh from backend.' });
        navigate('/'); // Navigate to home to see the refreshed (potentially empty) state
    } catch (error) {
        console.error("Error resetting data:", error);
        setFeedback({ type: 'error', message: 'Failed to reset local portfolio data state.' });
    } finally {
        setIsResetting(false);
    }
  };

  const getFeedbackStyles = (type: 'success' | 'error' | 'info') => {
    switch(type) {
        case 'success': return { bg: 'bg-green-700', border: 'border-green-600', iconColor: 'text-green-200', textColor: 'text-green-100', Icon: CheckCircleIcon };
        case 'error': return { bg: 'bg-red-700', border: 'border-red-600', iconColor: 'text-red-200', textColor: 'text-red-100', Icon: ExclamationCircleIcon };
        case 'info': return { bg: 'bg-blue-700', border: 'border-blue-600', iconColor: 'text-blue-200', textColor: 'text-blue-100', Icon: InformationCircleIcon };
        default: return { bg: 'bg-gray-700', border: 'border-gray-600', iconColor: 'text-gray-200', textColor: 'text-gray-100', Icon: InformationCircleIcon };
    }
  }


  return (
    <div className="space-y-8">
      <div className="pb-6 border-b border-gray-700">
        <h1 className="text-4xl font-bold tracking-tight text-white flex items-center">
          <Cog8ToothIcon className="h-10 w-10 mr-3 text-indigo-400" />
          Settings
        </h1>
        <p className="mt-2 text-lg text-gray-400">Manage your application settings and data. (Sign-In Required for Data Operations)</p>
      </div>

      <section className="p-6 bg-gray-800 rounded-xl shadow-2xl">
        <h2 className="text-2xl font-semibold text-white mb-3">Data Management</h2>
        <p className="text-gray-400 mb-6">Import your portfolio movements or reset current session data.</p>

        {!isLoggedIn && (
            <div className="p-4 mb-6 rounded-md bg-yellow-700 border border-yellow-600 text-yellow-100">
                <div className="flex items-center">
                    <ExclamationCircleIcon className="h-6 w-6 mr-3 text-yellow-200" />
                    <p>Please sign in to upload movements or manage portfolio data on the backend.</p>
                </div>
            </div>
        )}

        {feedback && (() => {
            const styles = getFeedbackStyles(feedback.type);
            const Icon = styles.Icon;
            return (
              <div className={`p-4 mb-6 rounded-md ${styles.bg} ${styles.border}`}>
                <div className="flex items-start">
                    <Icon className={`h-6 w-6 mr-3 ${styles.iconColor} flex-shrink-0`} />
                    <p className={`text-sm ${styles.textColor}`}>{feedback.message}</p>
                </div>
                
                {feedback.processedMovementsList && feedback.processedMovementsList.length > 0 && (
                  <div className="mt-3 pl-9">
                    <h4 className={`text-md font-semibold ${styles.textColor}`}>
                        LLM Parsed Movements ({feedback.processedMovementsList.length}):
                    </h4>
                    <ul className="list-disc list-inside text-xs mt-1 space-y-1 max-h-40 overflow-y-auto">
                      {feedback.processedMovementsList.map((mov, index) => (
                        <li key={`succ-${index}`} className={styles.textColor}>
                          {mov.date} | {mov.type.toUpperCase()} | {mov.assetName || mov.assetSymbol || 'General'} | Qty: {mov.quantity ?? '-'} | Price: {mov.price ?? '-'} | Total: {mov.amount.toLocaleString()} {mov.currency}
                        </li>
                      ))}
                    </ul>
                     <p className={`text-xs mt-1 ${styles.textColor}`}>Note: Only 'buy' and 'sell' types are sent to backend as structured data.</p>
                  </div>
                )}

                {feedback.skippedNotes && feedback.skippedNotes.length > 0 && (
                    <div className="mt-3 pl-9">
                        <h4 className={`text-md font-semibold ${styles.textColor}`}>
                            Processing Notes/Skipped ({feedback.skippedNotes.length}):
                        </h4>
                        <ul className="list-disc list-inside text-xs mt-1 space-y-1 max-h-32 overflow-y-auto">
                           {feedback.skippedNotes.map((detail, index) => <li key={`skip-${index}`} className={styles.textColor}>{detail}</li>)}
                        </ul>
                    </div>
                )}
              </div>
            );
        })()}

        <div className="space-y-4 border-b border-gray-700 pb-6 mb-6">
            <h3 className="text-xl font-medium text-gray-100">Import Portfolio Movements</h3>
            <p className="text-sm text-gray-400">
                Upload a text file (e.g., CSV data pasted into a .txt, or a simple list of transactions).
                The AI will parse it, and 'buy'/'sell' transactions will be sent to the backend. Other types are logged locally for the session.
            </p>
            <div>
              <label htmlFor="movements-file-input" className="block text-sm font-medium text-gray-300 mb-1">
                Movements File
              </label>
              <input
                id="movements-file-input"
                type="file"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-indigo-50 hover:file:bg-indigo-700 cursor-pointer"
                accept=".txt,.csv,text/plain,text/csv" 
                disabled={!isLoggedIn}
              />
              {selectedFile && <p className="text-xs text-gray-500 mt-1">Selected: {selectedFile.name}</p>}
            </div>
            <button
              onClick={handleSubmitMovements}
              disabled={!selectedFile || isProcessing || !isLoggedIn}
              className="flex items-center justify-center px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-800"
            >
              {isProcessing ? (
                <><ArrowPathIcon className="h-5 w-5 mr-2 animate-spin" /> Processing...</>
              ) : (
                <><DocumentArrowUpIcon className="h-5 w-5 mr-2" /> Process & Save Movements</>
              )}
            </button>
        </div>

        <div className="space-y-4">
            <h3 className="text-xl font-medium text-gray-100">Reset Session Data</h3>
             <p className="text-sm text-gray-400">
                This will clear any locally processed movements from the current session. The portfolio view will then refresh based on the current state of your data on the backend server.
            </p>
            <button
              onClick={handleResetData}
              disabled={isResetting || !isLoggedIn}
              className="flex items-center justify-center px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-800"
            >
              {isResetting ? (
                <><ArrowPathIcon className="h-5 w-5 mr-2 animate-spin" /> Resetting...</>
              ) : (
                <><ExclamationCircleIcon className="h-5 w-5 mr-2" /> Clear Session & Refresh from Backend</>
              )}
            </button>
        </div>
      </section>
    </div>
  );
};

export default function SettingsPageWithBoundary() {
  return (
    <ErrorBoundary>
      <SettingsPage />
    </ErrorBoundary>
  );
}
