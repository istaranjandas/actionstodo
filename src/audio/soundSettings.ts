import { useSyncExternalStore } from 'react';

export interface SoundSettings {
  effectsEnabled: boolean;
  effectsVolume: number;
  musicEnabled: boolean;
  musicVolume: number;
}

const SOUND_SETTINGS_KEY = 'actionstodo_sound_settings_v1';

const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  effectsEnabled: true,
  effectsVolume: 0.6,
  musicEnabled: false,
  musicVolume: 0.5
};

const listeners = new Set<() => void>();

function readFlag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readVolume(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

function loadSoundSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(SOUND_SETTINGS_KEY);
    if (!raw) return DEFAULT_SOUND_SETTINGS;
    const stored = JSON.parse(raw) as Partial<SoundSettings>;
    return {
      effectsEnabled: readFlag(stored.effectsEnabled, DEFAULT_SOUND_SETTINGS.effectsEnabled),
      effectsVolume: readVolume(stored.effectsVolume, DEFAULT_SOUND_SETTINGS.effectsVolume),
      musicEnabled: readFlag(stored.musicEnabled, DEFAULT_SOUND_SETTINGS.musicEnabled),
      musicVolume: readVolume(stored.musicVolume, DEFAULT_SOUND_SETTINGS.musicVolume)
    };
  } catch {
    return DEFAULT_SOUND_SETTINGS;
  }
}

let soundSettings = loadSoundSettings();

export function getSoundSettings(): SoundSettings {
  return soundSettings;
}

export function updateSoundSettings(updates: Partial<SoundSettings>): void {
  soundSettings = { ...soundSettings, ...updates };
  try {
    localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(soundSettings));
  } catch {
    // Storage can be full or blocked; the choice still applies for this visit
  }
  listeners.forEach((listener) => listener());
}

export function subscribeSoundSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSoundSettings(): SoundSettings {
  return useSyncExternalStore(subscribeSoundSettings, getSoundSettings, getSoundSettings);
}
