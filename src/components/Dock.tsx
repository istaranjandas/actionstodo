// The dock: one floating glass pill in the top-left corner — the mascot anchors the brand, then the
// lenses. The date ruler and the month label are gone, so the sky reaches the top edge; the slate
// header carries the date and opens the calendar, and Q / E still walk the path.
import { BrandMark } from './BrandMark';
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
    <nav className="ribbon" aria-label="Path navigation">
      <div className="lens-bar">
        <BrandMark />
        <ViewNav activeKey={activeLens} counts={lensCounts} showPlanner={showPlanner} onSelect={onSelectLens} />
      </div>
    </nav>
  );
}
