import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

type SelectedPortfolioContextType = {
  selectedPortfolio: string | null;
  setSelectedPortfolio: (name: string | null) => void;
  clearSelectedPortfolio: () => void;
};

const SelectedPortfolioContext = createContext<SelectedPortfolioContextType | undefined>(undefined);

export const SelectedPortfolioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedPortfolio, setSelectedPortfolioState] = useState<string | null>(() => {
    try {
      return localStorage.getItem('selectedPortfolio');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (selectedPortfolio) localStorage.setItem('selectedPortfolio', selectedPortfolio);
      else localStorage.removeItem('selectedPortfolio');
    } catch {
      // ignore
    }
  }, [selectedPortfolio]);

  const setSelectedPortfolio = useCallback((name: string | null) => {
    setSelectedPortfolioState(name);
  }, []);

  const clearSelectedPortfolio = useCallback(() => {
    setSelectedPortfolioState(null);
  }, []);

  return (
    <SelectedPortfolioContext.Provider value={{ selectedPortfolio, setSelectedPortfolio, clearSelectedPortfolio }}>
      {children}
    </SelectedPortfolioContext.Provider>
  );
};

export const useSelectedPortfolio = (): SelectedPortfolioContextType => {
  const ctx = useContext(SelectedPortfolioContext);
  if (!ctx) throw new Error('useSelectedPortfolio must be used within SelectedPortfolioProvider');
  return ctx;
};

export default SelectedPortfolioContext;
