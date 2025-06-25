import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ChatMessage, GroundingChunk, GroundingChunkWeb, CopilotAction, Asset } from '../types';
import { PaperAirplaneIcon, UserCircleIcon, SparklesIcon, LinkIcon, DocumentChartBarIcon, NewspaperIcon } from '@heroicons/react/24/solid';
import { getChatResponse, getPortfolioAnalysis, getAssetNews } from '../services/geminiService';
import { getAssets } from '../services/portfolioService';
import { COPILOT_PROMPT_ANALYZE_PORTFOLIO, COPILOT_PROMPT_GET_ASSET_NEWS } from '../constants';


const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSendMessage = useCallback(async (actionType: CopilotAction = CopilotAction.GENERAL_QUERY, predefinedQuery?: string) => {
    const currentInput = predefinedQuery || input;
    if (currentInput.trim() === '' && actionType === CopilotAction.GENERAL_QUERY) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString() + 'user',
      sender: 'user',
      text: currentInput,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    if (!predefinedQuery) setInput('');
    setIsLoading(true);

    try {
      let aiResponseText: string = "";
      let aiSources: GroundingChunk[] | undefined = undefined;

      if (actionType === CopilotAction.ANALYZE_PORTFOLIO) {
        const assets = await getAssets();
        const analysis = await getPortfolioAnalysis(assets);
        aiResponseText = analysis.text;
        aiSources = analysis.sources;
      } else if (actionType === CopilotAction.GET_ASSET_NEWS) {
        const assets = await getAssets();
        // Get top 5 asset symbols by value
        const topAssetSymbols = assets
          .sort((a, b) => b.value - a.value)
          .slice(0, 5)
          .map(a => a.symbol)
          .filter(s => s) as string[];
        
        if (topAssetSymbols.length > 0) {
          const news = await getAssetNews(topAssetSymbols);
          aiResponseText = news.text;
          aiSources = news.sources;
        } else {
          aiResponseText = "You don't seem to have any assets in your portfolio to get news for.";
        }
      } else { // General Query
        const response = await getChatResponse(currentInput);
        aiResponseText = response.text;
        aiSources = response.sources;
      }
      
      const aiMessage: ChatMessage = {
        id: Date.now().toString() + 'ai',
        sender: 'ai',
        text: aiResponseText,
        timestamp: new Date(),
        sources: aiSources,
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error("Error getting AI response:", error);
      const errorMessage: ChatMessage = {
        id: Date.now().toString() + 'ai_error',
        sender: 'ai',
        text: "Sorry, I encountered an error. Please try again. (Ensure your API_KEY is configured if this is a local dev environment)",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [input]);

  const renderSource = (source: GroundingChunk, index: number): React.ReactNode => {
    if (source.web) {
      const webSource = source.web as GroundingChunkWeb;
      return (
        <a
          key={`source-${index}`}
          href={webSource.uri}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center space-x-1 text-xs text-indigo-400 hover:text-indigo-300 underline"
        >
          <LinkIcon className="h-3 w-3" />
          <span>{webSource.title || webSource.uri}</span>
        </a>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto bg-gray-800 shadow-2xl rounded-xl">
      <div className="p-6 border-b border-gray-700">
        <h2 className="text-2xl font-semibold text-white flex items-center">
          <SparklesIcon className="h-7 w-7 mr-2 text-indigo-400" />
          AI Copilot
        </h2>
        <p className="text-sm text-gray-400">Your intelligent portfolio assistant. Ask questions or use the quick actions below.</p>
      </div>

      <div className="p-4 border-b border-gray-700 flex flex-wrap gap-2">
        <button
          onClick={() => handleSendMessage(CopilotAction.ANALYZE_PORTFOLIO, COPILOT_PROMPT_ANALYZE_PORTFOLIO)}
          disabled={isLoading}
          className="flex items-center px-3 py-2 text-sm bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <DocumentChartBarIcon className="h-5 w-5 mr-2" />
          {COPILOT_PROMPT_ANALYZE_PORTFOLIO}
        </button>
        <button
          onClick={() => handleSendMessage(CopilotAction.GET_ASSET_NEWS, COPILOT_PROMPT_GET_ASSET_NEWS)}
          disabled={isLoading}
          className="flex items-center px-3 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <NewspaperIcon className="h-5 w-5 mr-2" />
          {COPILOT_PROMPT_GET_ASSET_NEWS}
        </button>
      </div>

      <div className="flex-1 p-6 space-y-4 overflow-y-auto">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xl p-4 rounded-xl shadow ${
                msg.sender === 'user' 
                  ? 'bg-indigo-600 text-white rounded-br-none' 
                  : 'bg-gray-700 text-gray-200 rounded-bl-none'
              }`}
            >
              <div className="flex items-center mb-1">
                {msg.sender === 'ai' ? <SparklesIcon className="h-5 w-5 mr-2 text-indigo-400" /> : <UserCircleIcon className="h-5 w-5 mr-2 text-gray-400" />}
                <span className="font-semibold text-sm">{msg.sender === 'user' ? 'You' : 'AI Copilot'}</span>
              </div>
              <p className="whitespace-pre-wrap">{msg.text}</p>
              {msg.sender === 'ai' && msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-600 space-y-1">
                  <p className="text-xs font-semibold text-gray-400">Sources:</p>
                  {msg.sources.map(renderSource)}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
        {isLoading && (
          <div className="flex justify-start">
             <div className="max-w-xs p-3 rounded-lg shadow bg-gray-700 text-gray-200">
                <div className="flex items-center">
                    <SparklesIcon className="h-5 w-5 mr-2 text-indigo-400 animate-pulse" />
                    <span className="text-sm italic">AI is thinking...</span>
                </div>
            </div>
          </div>
        )}
      </div>
      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center space-x-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSendMessage(CopilotAction.GENERAL_QUERY)}
            placeholder="Ask a question or type a command..."
            className="flex-1 p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none placeholder-gray-400 text-gray-100"
            disabled={isLoading}
          />
          <button
            onClick={() => handleSendMessage(CopilotAction.GENERAL_QUERY)}
            disabled={isLoading || input.trim() === ''}
            className="p-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-800"
            aria-label="Send message"
          >
            <PaperAirplaneIcon className="h-6 w-6" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
