import { useEffect, useState } from 'react';

// Keeps a panel mounted long enough to play its exit animation after it is closed
export function usePresence(isOpen: boolean, exitMs = 220): { isMounted: boolean; isClosing: boolean } {
  const [isMounted, setIsMounted] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setIsMounted(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [isOpen, exitMs]);

  return { isMounted: isOpen || isMounted, isClosing: !isOpen && isMounted };
}
