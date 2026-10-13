import { Gamepad2, ListChecks } from 'lucide-react';

export type ViewportMode = 'manual' | 'game';

interface ViewportModeToggleProps {
  mode: ViewportMode;
  onChange: (mode: ViewportMode) => void;
}

const MODE_OPTIONS: { mode: ViewportMode; label: string; Icon: typeof ListChecks }[] = [
  { mode: 'manual', label: 'Manual', Icon: ListChecks },
  { mode: 'game', label: 'Game', Icon: Gamepad2 }
];

export function ViewportModeToggle({ mode, onChange }: ViewportModeToggleProps) {
  return (
    <div className="viewport-mode-toggle" role="radiogroup" aria-label="App mode">
      {MODE_OPTIONS.map(({ mode: optionMode, label, Icon }) => (
        <button
          key={optionMode}
          type="button"
          role="radio"
          aria-checked={mode === optionMode}
          className={`viewport-mode-option ${mode === optionMode ? 'is-active' : ''}`}
          onClick={() => onChange(optionMode)}
        >
          <Icon size={14} strokeWidth={2.2} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
