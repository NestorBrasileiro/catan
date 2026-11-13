import { useEffect, useMemo, useState } from 'react';
import type { ViewPadding } from '../Board3D/cameraBus';

function useViewport() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return size;
}

// How much of the screen the floating panels cover, so the 3D camera frames the island in the rest
// (keep in sync with the HUD grid in GameView.css and the lobby layout in App.css)
export function useHudPadding(screen: 'game' | 'lobby'): ViewPadding {
  const { width } = useViewport();
  return useMemo(() => {
    const phone = width <= 760;
    if (screen === 'lobby') {
      return phone ? { top: 60, right: 0, bottom: 300, left: 0 } : { top: 40, right: 0, bottom: 0, left: Math.min(560, width * 0.4) };
    }
    if (phone) return { top: 230, right: 56, bottom: 150, left: 0 };
    // the right column always holds the log; the drawer below it only makes it taller
    const side = width <= 1180 ? 320 : 360;
    return { top: 64, right: side + 28, bottom: 104, left: 90 };
  }, [screen, width]);
}
