import { createPersistedStore } from './createPersistedStore';

export interface DisplaySettings {
  // Animations ship off so the interface stays smooth on low-end machines; the switch turns them on
  animationsEnabled: boolean;
}

const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  animationsEnabled: false
};

const displayStore = createPersistedStore<DisplaySettings>(
  'actionstodo_animations_v1',
  DEFAULT_DISPLAY_SETTINGS,
  (stored) => ({
    animationsEnabled:
      typeof stored.animationsEnabled === 'boolean'
        ? stored.animationsEnabled
        : DEFAULT_DISPLAY_SETTINGS.animationsEnabled
  })
);

export const getDisplaySettings = displayStore.get;
export const updateDisplaySettings = displayStore.update;
export const subscribeDisplaySettings = displayStore.subscribe;
export const useDisplaySettings = displayStore.use;
