/**
 * Count a number up once, on mount.
 *
 * Decoration, so anyone asking for less motion gets the final value immediately and no frames
 * are scheduled at all. Driven by requestAnimationFrame against a real clock rather than a
 * per-frame increment, so the duration holds whatever the frame rate is.
 */

import { useEffect, useRef, useState } from 'react';

export function useCountUp(target: number, durationMs = 1400, delayMs = 0): number {
  const still =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const [value, setValue] = useState(still ? target : 0);
  const frame = useRef<number>();

  useEffect(() => {
    if (still) {
      setValue(target);
      return undefined;
    }

    let start = 0;
    const timer = window.setTimeout(() => {
      const step = (now: number) => {
        if (start === 0) start = now;
        const t = Math.min(1, (now - start) / durationMs);
        // Ease out, so it decelerates into the final figure instead of stopping dead.
        const eased = 1 - Math.pow(1 - t, 3);
        setValue(Math.round(target * eased));
        if (t < 1) frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target, durationMs, delayMs, still]);

  return value;
}
