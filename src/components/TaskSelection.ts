import { createContext, useContext } from 'react';

// Which task the inspector is showing, and how a row asks to open it
export interface TaskSelection {
  selectedTaskId: string | null;
  // viaKeyboard moves focus into the details panel so editing can continue without the mouse
  openTask: (taskId: string, viaKeyboard?: boolean) => void;
}

export const TaskSelectionContext = createContext<TaskSelection>({ selectedTaskId: null, openTask: () => {} });

export function useTaskSelection(): TaskSelection {
  return useContext(TaskSelectionContext);
}
