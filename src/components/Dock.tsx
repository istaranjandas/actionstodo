// The dock: one compact bottom bar. The lenses are the only controls here — the brand lives in the
// dashboard header, and the system cluster sits opposite it, so navigation has room to breathe.
import { ViewNav } from './ViewNav';
import type { NavKey } from '../modules/navigation';

interface DockProps {
  activeLens: NavKey | null;
  lensCounts: Partial<Record<NavKey, number | null>>;
  showPlanner: boolean;
  onSelectLens: (key: NavKey) => void;
}

export function Dock({ activeLens, lensCounts, showPlanner, onSelectLens }: DockProps) {
  return (
    <nav className="ribbon" aria-label="Workspace navigation">
      <div className="lens-bar">
        <ViewNav activeKey={activeLens} counts={lensCounts} showPlanner={showPlanner} onSelect={onSelectLens} />
      </div>
    </nav>
  );
}
