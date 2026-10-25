// Top-left of the HUD: the name of where you are on the path, like a game's area title.
// A focused day folds its date into the same line, so "TODAY" and "SAT, OCT 24" are never said twice.
interface LocationTitleProps {
  title: string;
  subtitle: string;
  date?: string | null;
}

export function LocationTitle({ title, subtitle, date }: LocationTitleProps) {
  return (
    <header className="location">
      <div className="location-copy" aria-live="polite">
        {subtitle && <span className="location-subtitle">{subtitle}</span>}
        {/* Keyed so each new place name sweeps in */}
        <h1 className="location-title" key={`${title}:${date ?? ''}`}>
          {title}
          {date && <span className="location-date">· {date}</span>}
        </h1>
      </div>
    </header>
  );
}
