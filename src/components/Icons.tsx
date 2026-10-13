import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
};

const DEVIL_PATH =
  'M16 6c-2 0-4 1-6 2-1-3-3-5-7-6 2 4 4 8 4 12 0 6 4 11 9 13 5-2 9-7 9-13 0-4 2-8 4-12-4 1-6 3-7 6-2-1-4-2-6-2zm-6 7l4 2-3 1-1-3zm12 0l-4 2 3 1 1-3zm-10 7c2 2 6 2 8 0l-2 2-2-1.5-2 1.5-2-2z';

export function DevilIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" {...props}>
      <path fillRule="evenodd" clipRule="evenodd" d={DEVIL_PATH} />
    </svg>
  );
}

export function CreatorAvatarIcon({ size = 28, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="18" cy="18" r="17" fill="var(--bg-subtle)" stroke="var(--border)" strokeWidth="1.5" />
      <path d="M10 13c1-5 5-8 10-8 6 0 9 3 9 7 0 2-1 4-2 5-1-3-3-5-6-5-4 1-5 4-8 4-1.5 0-2.5-.5-3-3z" fill="currentColor" />
      <path d="M12 15c0 5 2.5 8.5 6 8.5s6-3.5 6-8.5v-2H12v2z" fill="var(--bg)" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="15.2" cy="16.5" r="1.1" fill="currentColor" />
      <circle cx="20.8" cy="16.5" r="1.1" fill="currentColor" />
      <path d="M16 19.2c.6.8 1.8.8 2.4 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M11.5 15.5c-.8 0-1.2.6-1.2 1.3s.5 1.3 1.2 1.3" stroke="currentColor" strokeWidth="1.1" />
      <path d="M24.5 15.5c.8 0 1.2.6 1.2 1.3s-.5 1.3-1.2 1.3" stroke="currentColor" strokeWidth="1.1" />
      <path d="M11 29c1-3 3-5 7-5s6 2 7 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function GoogleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
    </svg>
  );
}

export function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...strokeProps}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...strokeProps}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function MotionIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...strokeProps}>
      <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
      <path d="M5 16l.6 1.4L7 18l-1.4.6L5 20l-.6-1.4L3 18l1.4-.6z" />
    </svg>
  );
}

export function CalendarIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export function ClockIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...strokeProps}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function FilterIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" {...strokeProps}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

export function ChevronDownIcon() {
  return (
    <svg className="dropdown-chevron" width="10" height="10" viewBox="0 0 24 24" {...strokeProps}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function TableGridIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" {...strokeProps}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  );
}

export function ListLinesIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" {...strokeProps}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function SidebarViewIcon({ view }: { view: string }) {
  const common = { className: 'sidebar-item-icon', width: 15, height: 15, viewBox: '0 0 24 24', ...strokeProps };
  switch (view) {
    case 'today':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      );
    case 'this-week':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case 'upcoming':
      return (
        <svg {...common}>
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      );
    case 'completed':
      return (
        <svg {...common}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <path d="M22 4 12 14.01l-3-3" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M22 12h-6l-2 3h-4l-2-3H2" />
          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
        </svg>
      );
  }
}
