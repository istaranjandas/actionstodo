import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { usePresence } from '../hooks/usePresence';

const SHORTCUT_GROUPS: { title: string; items: [string[], string][] }[] = [
  {
    title: 'The path',
    items: [
      [['Q'], 'Walk to the previous day'],
      [['E'], 'Walk to the next day'],
      [['Home'], 'Back to today'],
      [['1', '–', '3'], 'Lens: Today, All, Planner'],
      [['Esc'], 'Close details · back to your lens']
    ]
  },
  {
    title: 'Tasks',
    items: [
      [['T'], 'Open the command bar to log a task'],
      [['Enter'], 'Same, when nothing is selected'],
      [['↑', '↓'], 'Move between tasks'],
      [['Enter'], 'Open task details (on a task)'],
      [['Space'], 'Complete / reopen'],
      [['F2'], 'Rename in place']
    ]
  },
  {
    title: 'In the world',
    items: [
      [['Click'], 'A lantern opens its task'],
      [['Click'], 'A post label walks to that day']
    ]
  }
];

export function ShortcutsOverlay({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { isMounted, isClosing } = usePresence(isOpen, 220);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) closeRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  if (!isMounted) return null;

  return (
    <div className={`overlay-layer ${isClosing ? 'is-closing' : ''}`}>
      <div className="overlay-backdrop" onClick={onClose} />
      <div className="shortcuts-panel" role="dialog" aria-label="Keyboard shortcuts">
        <div className="shortcuts-header">
          <span className="shortcuts-title">Controls</span>
          <button type="button" className="inspector-close" aria-label="Close" data-sfx="close" ref={closeRef} onClick={onClose}>
            <X size={15} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
        <div className="shortcuts-groups">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} className="shortcuts-group">
              <h2 className="shortcuts-group-title">{group.title}</h2>
              {group.items.map(([keys, description]) => (
                <div key={`${keys.join('')}-${description}`} className="shortcut-row">
                  <span className="shortcut-keys">
                    {keys.map((key, index) => (key === '–' ? <span key={index} className="shortcut-to">to</span> : <kbd key={index}>{key}</kbd>))}
                  </span>
                  <span className="shortcut-description">{description}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
