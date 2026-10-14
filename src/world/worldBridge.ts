// Shared state between the interface (DOM) and the 3D scene, without React re-renders.
// The scene writes world points; the projector maps them onto DOM labels every frame.
export interface WorldDayTask {
  id: string;
  text: string;
  completed: boolean;
}

export interface WorldDay {
  date: string;
  offset: number;
  tasks: WorldDayTask[];
}

export const worldBridge = {
  // DOM labels floating over day posts, keyed by ISO date
  dayLabels: new Map<string, HTMLElement>(),
  // Tooltip that follows the lantern under the pointer
  hoverLabel: null as HTMLElement | null,
  hoveredTaskId: null as string | null,
  // World-space points written by the scene: 'day:<date>' above each post, 'task:<id>' at each lantern
  points: new Map<string, [number, number, number]>(),
  focusDate: null as string | null,
  selectedTaskId: null as string | null,
  isActive: false,
  onOpenTask: (_taskId: string) => {},
  onFocusDay: (_date: string) => {}
};
