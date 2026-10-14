// Where the camera stands for each lens. Day focus frames one waypost; the other lenses frame
// the stretch of trail they cover, so switching lens is a camera journey along the path.
import { dayPostPlacement } from './trail';

export type WorldLens = 'day' | 'upcoming' | 'this-week' | 'all' | 'completed' | 'planner';

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  // What must stay in frame on narrow portrait screens (the focused post)
  focus?: [number, number, number];
}

export function cameraPoseFor(lens: WorldLens, focusOffset: number, weekStartOffset: number): CameraPose {
  switch (lens) {
    case 'upcoming': {
      const today = dayPostPlacement(0);
      const ahead = dayPostPlacement(8);
      return { position: [today.x - 9, 10, today.z + 26], target: [ahead.x, 3, ahead.z] };
    }
    case 'this-week': {
      // A high shot down the trail over the week's seven posts
      const start = dayPostPlacement(weekStartOffset);
      const end = dayPostPlacement(weekStartOffset + 6);
      return { position: [start.x - 14, 17, start.z + 36], target: [end.x, 1.5, end.z] };
    }
    case 'all': {
      const anchor = dayPostPlacement(2);
      return { position: [anchor.x - 24, 46, anchor.z + 78], target: [anchor.x, 0, anchor.z - 10] };
    }
    case 'completed': {
      // Turn round and look back along the path already walked
      const today = dayPostPlacement(0);
      const behind = dayPostPlacement(-5);
      return { position: [today.x - 7, 5.5, today.z - 14], target: [behind.x, 2, behind.z] };
    }
    case 'planner':
      return { position: [0, 150, 30], target: [0, 0, -95] };
    default: {
      // Stand back along the trail, always left of the post so it frames to the right of the day slate
      const post = dayPostPlacement(focusOffset);
      return { position: [post.x - 6.5, 4.4, post.z + 15], target: [post.x - 1, 2.4, post.z - 6], focus: [post.x, 3, post.z] };
    }
  }
}
