/**
 * The one moment the app interrupts someone, and it is only ever to say well done.
 *
 * Dismissing it marks the underlying notification read, so it appears once per win and never
 * again. Nothing here can be failed or lost; there is a single button and it closes.
 */

import { useEffect, useRef } from 'react';
import type { CelebrationDto } from '@gtm/shared';

export function Celebration({
  celebration,
  onDismiss,
}: {
  celebration: CelebrationDto;
  onDismiss: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus the only control, and let Escape close it like any other dialog.
  useEffect(() => {
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onDismiss();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div className="celebrate-back" role="presentation" onClick={onDismiss}>
      <div
        className="celebrate card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="celebrate-title"
        aria-describedby="celebrate-body"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <Burst />
        <span className="kicker">Week complete</span>
        <h2 id="celebrate-title">{celebration.title}</h2>
        <p id="celebrate-body">{celebration.body}</p>
        <button ref={closeRef} type="button" className="btn btn-primary" onClick={onDismiss}>
          Thanks
        </button>
      </div>
    </div>
  );
}

/** A still burst, drawn once. Decoration, and hidden from assistive tech. */
function Burst() {
  const rays = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg className="burst" width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
      {rays.map((angle, i) => (
        <rect
          key={angle}
          x="58.5"
          y="8"
          width="3"
          height="15"
          rx="1.5"
          fill={i % 3 === 0 ? 'var(--c1)' : i % 3 === 1 ? 'var(--c2)' : 'var(--c4)'}
          transform={`rotate(${angle} 60 60)`}
        />
      ))}
      <circle cx="60" cy="60" r="27" fill="var(--accent-tint)" />
      <path
        d="M48 60.5 56.5 69 73 52"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
