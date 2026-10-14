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

export function ListLinesIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" {...strokeProps}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
