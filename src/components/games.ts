// The mini-games the app ships. The profile panel (SystemMenu) lists them at the top and launches them.
import { Car, Swords } from 'lucide-react';

export type GameId = 'arena' | 'alpine';

interface GameEntry {
  id: GameId;
  title: string;
  detail: string;
  Icon: typeof Swords;
}

// Only what actually ships: the in-app quest arena, and the standalone alpine run
export const GAMES: GameEntry[] = [
  {
    id: 'arena',
    title: 'Quest Arena',
    detail: 'Steer the runner across the island and collect a relic for every task you clear.',
    Icon: Swords
  },
  {
    id: 'alpine',
    title: 'Alpine Overdrive',
    detail: 'A night drive down the pass. Arrow keys, no brakes, one long descent.',
    Icon: Car
  }
];
