import { combine, createEvent, createStore, sample } from 'effector';

export type AnalyzerMode = 'demo' | 'live';

export const modeChanged = createEvent<AnalyzerMode>();
export const apiKeyChanged = createEvent<string>();

// The key lives in memory only: never persisted, never logged.
export const $apiKey = createStore('');
export const $mode = createStore<AnalyzerMode>('demo');
export const $analyzerSettings = combine({ mode: $mode, apiKey: $apiKey });

sample({
  clock: modeChanged,
  target: $mode,
});

sample({
  clock: apiKeyChanged,
  fn: (key) => key.trim(),
  target: $apiKey,
});
