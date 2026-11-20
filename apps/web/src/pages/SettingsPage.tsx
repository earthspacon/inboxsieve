import { useUnit } from 'effector-react';
import { KeyRound } from 'lucide-react';

import { LIVE_MODEL } from '../leads/live-analyzer';
import { $apiKey, $mode, apiKeyChanged, modeChanged } from '../settings/model';
import type { AnalyzerMode } from '../settings/model';
import { Card } from './ui';

const MODES: Array<{ mode: AnalyzerMode; title: string; text: string }> = [
  {
    mode: 'demo',
    title: 'Demo analyzer',
    text: 'Rule-based scoring that runs in the browser. Works offline, no key needed.',
  },
  {
    mode: 'live',
    title: `Live · ${LIVE_MODEL}`,
    text: 'Sends each new lead to the Anthropic Messages API and validates the JSON it returns.',
  },
];

export const SettingsPage = () => {
  const { mode, apiKey } = useUnit({ mode: $mode, apiKey: $apiKey });
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500">Choose how the agent analyzes leads.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {MODES.map((item) => {
          return (
            <button
              key={item.mode}
              type="button"
              onClick={() => modeChanged(item.mode)}
              className={`rounded-xl border-2 bg-white p-4 text-left ${mode === item.mode ? 'border-brand-600' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <p className="text-sm font-semibold">{item.title}</p>
              <p className="mt-1 text-xs text-slate-500">{item.text}</p>
            </button>
          );
        })}
      </div>
      <Card className="p-5">
        <label className="block text-sm">
          <span className="flex items-center gap-2 font-medium text-slate-700">
            <KeyRound className="size-4" />
            Anthropic API key
          </span>
          <input
            type="password"
            autoComplete="off"
            placeholder="sk-ant-…"
            value={apiKey}
            onChange={(event) => apiKeyChanged(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none"
          />
        </label>
        <p className="mt-2 text-xs text-slate-500">
          Kept in memory only: it is not saved and is gone after a reload. Requests go straight from your browser to api.anthropic.com.
        </p>
      </Card>
    </div>
  );
};
