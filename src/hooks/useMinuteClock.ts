// Minutes since local midnight, refreshed on a timer and whenever the tab comes back.
// The schedule marker, the NEXT UP banner and the world's next-objective label all read this one clock.
import { useEffect, useState } from 'react';

const readMinutes = () => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

export function useMinuteClock(): number {
  const [minutes, setMinutes] = useState(readMinutes);

  useEffect(() => {
    const tick = () => setMinutes(readMinutes());
    const timer = window.setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  return minutes;
}
