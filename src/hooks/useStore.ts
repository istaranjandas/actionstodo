import { useSyncExternalStore } from 'react';
import { getStoreVersion, state, subscribeStore } from '../modules/store';
import type { AppState } from '../types';

export function useStore(): AppState {
  useSyncExternalStore(subscribeStore, getStoreVersion, getStoreVersion);
  return state;
}
