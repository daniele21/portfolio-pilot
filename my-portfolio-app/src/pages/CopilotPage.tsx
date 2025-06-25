import React from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import ChatInterface from '../components/ChatInterface';

// CopilotPage.tsx is deprecated and replaced by ReportPage. You can safely remove this file if not needed.

const CopilotPage: React.FC = () => {
  return (
    <div>
      {/* 
        The ChatInterface itself has a header. 
        If a page-specific title outside the chat component is needed, it can be added here.
        For now, ChatInterface provides its own context.
      */}
      <ChatInterface />
    </div>
  );
};

export default function CopilotPageWithBoundary() {
  return (
    <ErrorBoundary>
      <CopilotPage />
    </ErrorBoundary>
  );
}
