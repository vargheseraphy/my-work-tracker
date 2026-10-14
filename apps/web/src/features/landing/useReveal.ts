/**
 * Reveal-on-scroll, as an enhancement rather than a requirement.
 *
 * The hidden starting state is scoped to `.lp-anim`, a class this hook adds only once it has a
 * working observer. If anything stops that happening — no JavaScript, an old browser, a throttled
 * background tab, an error earlier in the bundle — the page simply renders fully visible instead
 * of staying permanently blank. A marketing page that depends on JS to be readable is a page
 * that is sometimes invisible.
 *
 * One observer for the whole page; each element is unobserved the moment it has appeared, so
 * nothing re-animates on the way back up.
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

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      },
      // Start a little before the element reaches the fold, so it is already settled on arrival.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
    );

    for (const el of targets) observer.observe(el);
    return () => {
      observer.disconnect();
      root?.classList.remove('lp-anim');
    };
  }, []);
}
