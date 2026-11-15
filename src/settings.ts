export type GraphicsPreset = 'low' | 'medium';

export interface Settings {
  preset: GraphicsPreset;
  effects: boolean;
  volume: number;
  muted: boolean;
}

const KEY = 'neon-drift:settings';
const defaults: Settings = { preset: 'medium', effects: true, volume: 0.55, muted: false };

export function loadSettings(): Settings {
  try {
    const stored: Partial<Settings> = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
    return {
      preset: stored.preset === 'low' ? 'low' : 'medium',
      effects: typeof stored.effects === 'boolean' ? stored.effects : defaults.effects,
      volume: typeof stored.volume === 'number' && Number.isFinite(stored.volume)
        ? Math.max(0, Math.min(1, stored.volume)) : defaults.volume,
      muted: typeof stored.muted === 'boolean' ? stored.muted : defaults.muted
    };
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // The settings still apply to the current session.
  }
}
