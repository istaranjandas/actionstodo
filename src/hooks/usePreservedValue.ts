import { useRef } from 'react';

// Keeps the last value it was given while it is null, so a panel can animate out with its
// content still in place. The single copy of a pattern the details slates both rely on.
export function usePreservedValue<T>(value: T | null): T | null {
  const ref = useRef<T | null>(value);
  if (value) ref.current = value;
  return ref.current;
}
