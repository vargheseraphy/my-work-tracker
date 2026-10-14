/**
 * Reveal-on-scroll, as an enhancement rather than a requirement.
 *
 * Three guards, because content that is hidden by default and revealed by JavaScript is content
 * that is sometimes invisible:
 *
 *  1. The hidden state is scoped to `.lp-anim`, added only once this hook runs. No JavaScript,
 *     an old browser, or reduced motion, and the page simply renders.
 *  2. Anything already inside the viewport is revealed synchronously on mount, so the first
 *     screen never waits on a callback. A background tab throttles IntersectionObserver, and the
 *     hero must not depend on it.
 *  3. A backstop timer reveals whatever is left if the observer has not delivered in good time.
 *
 * Each element is unobserved the moment it appears, so nothing re-animates on the way back up.
 */

import { useEffect } from 'react';

export function useReveal(): void {
  useEffect(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (targets.length === 0) return undefined;

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still || typeof IntersectionObserver === 'undefined') return undefined;

    const root = document.querySelector('.lp');
    root?.classList.add('lp-anim');

    // 2 ─ the first screen, without waiting for anything.
    const fold = window.innerHeight;
    const below: HTMLElement[] = [];
    for (const el of targets) {
      if (el.getBoundingClientRect().top < fold) el.classList.add('is-in');
      else below.push(el);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      },
      // Start a little before the element reaches the fold, so it is settled on arrival.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
    );
    for (const el of below) observer.observe(el);

    // 3 ─ backstop. If the observer has not reported by now, show everything anyway.
    const backstop = window.setTimeout(() => {
      for (const el of below) el.classList.add('is-in');
    }, 2500);

    return () => {
      window.clearTimeout(backstop);
      observer.disconnect();
      root?.classList.remove('lp-anim');
    };
  }, []);
}
