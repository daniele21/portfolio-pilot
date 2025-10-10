import React, { useState, useEffect } from 'react';
import { XMarkIcon, PlusIcon, TrashIcon, BellIcon } from '@heroicons/react/24/outline';
import type { AlertSettings, AlertCondition } from '../types';
import { getAlertSettings, saveAlertSettings, createDefaultAlertCondition, generateAlertId, deleteAlertSettings } from '../services/alertService';
import ActionButton from './ActionButton';

interface AlertSetupModalProps {
  open: boolean;
  onClose: () => void;
  portfolioName: string;
  portfolioHoldings?: { ticker: string; name?: string }[];
}

const AlertSetupModal: React.FC<AlertSetupModalProps> = ({
  open,
  onClose,
  portfolioName,
  portfolioHoldings = [],
}) => {
  const [settings, setSettings] = useState<AlertSettings>({
    portfolioName,
    conditions: [],
    emailNotifications: false,
    pushNotifications: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && portfolioName) {
      loadSettings();
    }
  }, [open, portfolioName]);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await getAlertSettings(portfolioName);
      setSettings(loaded);
    } catch (e) {
      setError('Failed to load alert settings');
      console.error('Failed to load alert settings:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveAlertSettings(settings);
      onClose();
    } catch (e) {
      setError('Failed to save alert settings');
      console.error('Failed to save alert settings:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setError(null);
    try {
      await deleteAlertSettings(portfolioName);
      // Reset local settings to defaults
      const defaults: AlertSettings = {
        portfolioName,
        conditions: [],
        emailNotifications: false,
        pushNotifications: false,
      };
      setSettings(defaults);
      // Also save defaults to idb so UI reflects cleared state
      try { await saveAlertSettings(defaults); } catch (e) { /* ignore */ }
    } catch (e) {
      setError('Failed to reset alert settings');
      console.error('Failed to reset alert settings:', e);
    } finally {
      setSaving(false);
    }
  };

  const addCondition = (type: AlertCondition['type']) => {
    const newCondition: AlertCondition = {
      id: generateAlertId(),
      ...createDefaultAlertCondition(type),
    };
    setSettings(prev => ({
      ...prev,
      conditions: [...prev.conditions, newCondition],
    }));
  };

  const updateCondition = (id: string, updates: Partial<AlertCondition>) => {
    setSettings(prev => ({
      ...prev,
      conditions: prev.conditions.map(condition =>
        condition.id === id ? { ...condition, ...updates } : condition
      ),
    }));
  };

  const removeCondition = (id: string) => {
    setSettings(prev => ({
      ...prev,
      conditions: prev.conditions.filter(condition => condition.id !== id),
    }));
  };

  const renderConditionForm = (condition: AlertCondition) => {
    return (
      <div key={condition.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={condition.enabled}
              onChange={(e) => updateCondition(condition.id, { enabled: e.target.checked })}
              className="rounded border-gray-600 bg-gray-700 text-indigo-600 focus:ring-indigo-500"
            />
            <input
              type="text"
              value={condition.name}
              onChange={(e) => updateCondition(condition.id, { name: e.target.value })}
              className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white flex-1"
              placeholder="Alert name"
            />
          </div>
          <ActionButton
            variant="ghost"
            size="sm"
            onClick={() => removeCondition(condition.id)}
          >
            <TrashIcon className="h-4 w-4" />
          </ActionButton>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Type-specific controls */}
          {condition.type === 'volatility' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Period</label>
              <select
                value={condition.period || '30d'}
                onChange={(e) => updateCondition(condition.id, { period: e.target.value as any })}
                className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white"
              >
                <option value="30d">30 Days</option>
                <option value="90d">90 Days</option>
                <option value="1y">1 Year</option>
              </select>
            </div>
          )}

          {(condition.type === 'portfolio_return' || condition.type === 'ticker_return') && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Time Frame</label>
              <select
                value={condition.timeframe || '1d'}
                onChange={(e) => updateCondition(condition.id, { timeframe: e.target.value as any })}
                className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white"
              >
                <option value="1d">1 Day</option>
                <option value="3d">3 Days</option>
                <option value="1w">1 Week</option>
                <option value="1m">1 Month</option>
                <option value="3m">3 Months</option>
                <option value="ytd">YTD</option>
                <option value="1y">1 Year</option>
              </select>
            </div>
          )}

          {condition.type === 'ticker_return' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Ticker</label>
              {portfolioHoldings.length > 0 ? (
                <select
                  value={condition.ticker || ''}
                  onChange={(e) => updateCondition(condition.id, { ticker: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white"
                >
                  <option value="">Select a ticker...</option>
                  {portfolioHoldings.map(holding => (
                    <option key={holding.ticker} value={holding.ticker}>
                      {holding.ticker} {holding.name ? `- ${holding.name}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={condition.ticker || ''}
                  onChange={(e) => updateCondition(condition.id, { ticker: e.target.value.toUpperCase() })}
                  className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white"
                  placeholder="e.g. AAPL"
                />
              )}
            </div>
          )}

          {/* Comparison */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Condition</label>
            <select
              value={condition.comparison}
              onChange={(e) => updateCondition(condition.id, { comparison: e.target.value as any })}
              className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white"
            >
              <option value="above">Above</option>
              <option value="below">Below</option>
            </select>
          </div>

          {/* Threshold */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Threshold ({condition.type === 'volatility' ? '%' : '%'})
            </label>
            <input
              type="number"
              value={condition.threshold}
              onChange={(e) => updateCondition(condition.id, { threshold: parseFloat(e.target.value) || 0 })}
              className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white"
              step="0.1"
              min="0"
            />
          </div>
        </div>

        {condition.description && (
          <div className="mt-2">
            <input
              type="text"
              value={condition.description}
              onChange={(e) => updateCondition(condition.id, { description: e.target.value })}
              className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300"
              placeholder="Description (optional)"
            />
          </div>
        )}
      </div>
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-2 sm:p-4" role="dialog" aria-modal="true">
      <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg sm:max-w-2xl md:max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <BellIcon className="h-6 w-6 text-indigo-400 flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="text-2xl font-bold text-white truncate">Alert Settings</h2>
              <span className="text-sm text-gray-400 block truncate">for {portfolioName}</span>
            </div>
          </div>
          <div className="flex-shrink-0 ml-3">
            <ActionButton variant="ghost" size="sm" onClick={onClose}>
              <XMarkIcon className="h-5 w-5" />
            </ActionButton>
          </div>
        </div>

  <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-500"></div>
              <span className="ml-3 text-gray-300">Loading settings...</span>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Notification Settings */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-3">Notification Preferences</h3>
                <div className="flex flex-col sm:flex-row gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={settings.emailNotifications}
                      onChange={(e) => setSettings(prev => ({ ...prev, emailNotifications: e.target.checked }))}
                      className="rounded border-gray-600 bg-gray-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    Email Notifications
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={settings.pushNotifications}
                      onChange={(e) => setSettings(prev => ({ ...prev, pushNotifications: e.target.checked }))}
                      className="rounded border-gray-600 bg-gray-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    Push Notifications
                  </label>
                </div>
              </div>

              {/* Alert Conditions */}
              <div className="mb-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 gap-3">
                  <h3 className="text-lg font-semibold text-white">Alert Conditions</h3>
                  <div className="flex flex-col sm:flex-row gap-2 w-full">
                    <ActionButton
                      className="w-full sm:w-auto justify-center"
                      variant="secondary"
                      size="sm"
                      onClick={() => addCondition('volatility')}
                    >
                      <PlusIcon className="h-4 w-4" />
                      Volatility
                    </ActionButton>
                    <ActionButton
                      className="w-full sm:w-auto justify-center"
                      variant="secondary"
                      size="sm"
                      onClick={() => addCondition('portfolio_return')}
                    >
                      <PlusIcon className="h-4 w-4" />
                      Portfolio Performance
                    </ActionButton>
                    <ActionButton
                      className="w-full sm:w-auto justify-center"
                      variant="secondary"
                      size="sm"
                      onClick={() => addCondition('ticker_return')}
                    >
                      <PlusIcon className="h-4 w-4" />
                      Asset Performance
                    </ActionButton>
                  </div>
                </div>

                <div className="space-y-4">
                  {settings.conditions.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <BellIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No alert conditions configured.</p>
                      <p className="text-sm">Click the buttons above to add alerts.</p>
                    </div>
                  ) : (
                    settings.conditions.map(renderConditionForm)
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-4 border-t border-gray-700">
                <div className="w-full sm:w-auto">
                  <ActionButton className="w-full sm:w-auto" variant="danger" size="md" onClick={handleReset} disabled={saving}>
                    Reset
                  </ActionButton>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                  <ActionButton className="w-full sm:w-auto" variant="ghost" size="md" onClick={onClose}>
                    Cancel
                  </ActionButton>
                  <ActionButton
                    className="w-full sm:w-auto"
                    variant="primary"
                    size="md"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Settings'}
                  </ActionButton>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AlertSetupModal;