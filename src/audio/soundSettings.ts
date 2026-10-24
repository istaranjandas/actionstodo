import { createPersistedStore } from '../modules/createPersistedStore';

export interface SoundSettings {
  effectsEnabled: boolean;
  effectsVolume: number;
  musicEnabled: boolean;
  musicVolume: number;
}

const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  effectsEnabled: true,
  effectsVolume: 0.6,
  musicEnabled: false,
  musicVolume: 0.5
};

function readFlag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readVolume(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

const soundStore = createPersistedStore<SoundSettings>(
  'actionstodo_sound_settings_v1',
  DEFAULT_SOUND_SETTINGS,
  (stored) => ({
    effectsEnabled: readFlag(stored.effectsEnabled, DEFAULT_SOUND_SETTINGS.effectsEnabled),
    effectsVolume: readVolume(stored.effectsVolume, DEFAULT_SOUND_SETTINGS.effectsVolume),
    musicEnabled: readFlag(stored.musicEnabled, DEFAULT_SOUND_SETTINGS.musicEnabled),
    musicVolume: readVolume(stored.musicVolume, DEFAULT_SOUND_SETTINGS.musicVolume)
  })
);

export const getSoundSettings = soundStore.get;
export const updateSoundSettings = soundStore.update;
export const subscribeSoundSettings = soundStore.subscribe;
export const useSoundSettings = soundStore.use;
