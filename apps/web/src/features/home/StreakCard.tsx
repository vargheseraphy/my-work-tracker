/**
 * Consistency, shown as a reward rather than a check.
 *
 * The tone is deliberate. A streak of zero is an invitation, never a failure; a broken run is
 * described by what it was, not by what was lost; and the flame only ever appears to say well
 * done. Nothing here is red, and nothing counts down.
 */

import type { StreakDto } from '@gtm/shared';

/** Warmer as the run gets longer. Decoration only, so the words never depend on it. */
function flameTone(days: number): string {
  if (days >= 20) return 'hot';
  if (days >= 10) return 'warm';
  return 'lit';
}

function Flame({ tone }: { tone: string }) {
  return (
    <svg
      className={`flame flame-${tone}`}
      width="26"
      height="26"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M12 2.5c.9 3.2-.6 4.8-2.1 6.3C8.2 10.5 6.6 12 6.6 14.8a5.4 5.4 0 0 0 10.8 0c0-1.7-.7-3.1-1.7-4.3-.4 .8-1.1 1.4-2 1.6.7-2.6-.2-5.3-1.7-9.6Z"
        fill="currentColor"
      />
      <path
        d="M12 21a3 3 0 0 1-3-3c0-1.6 1.3-2.5 2-3.6.5 1 1.3 1.5 2.2 2.1.8.5 1.8 1 1.8 2.4a3 3 0 0 1-3 2.1Z"
        fill="var(--surface)"
        opacity=".55"
      />
    </svg>
  );
}

export function StreakCard({ streak }: { streak: StreakDto }) {
  const { current, best, loggedToday, nextMilestone } = streak;
  const running = current > 0;

  // How far through the current milestone, for the quiet progress bar.
  const previous = nextMilestone === null ? current : lastMilestoneBefore(nextMilestone);
  const span = nextMilestone === null ? 1 : nextMilestone - previous;
  const through = nextMilestone === null ? 1 : (current - previous) / span;

  let note: string;
  if (!running && best > 0) {
    note = `Your best run is ${best} days. Log today to start the next one.`;
  } else if (!running) {
    note = 'Log any day this week to start one.';
  } else if (nextMilestone !== null) {
    const togo = nextMilestone - current;
    note = `${togo} more ${togo === 1 ? 'day' : 'days'} to reach ${nextMilestone}.`;
  } else {
    note = 'Further than anyone has gone. Keep it rolling.';
  }

  return (
    <div className="card stack streak-card">
      <span className="kicker">Consistency</span>
      <div className="streak-head">
        {running ? <Flame tone={flameTone(current)} /> : null}
        <span className="stat">
          {current} {current === 1 ? 'day' : 'days'}
        </span>
      </div>

      {running && nextMilestone !== null ? (
        <div
          className="bar streak-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={nextMilestone}
          aria-valuenow={current}
          aria-label={`${current} of ${nextMilestone} days towards the next milestone`}
        >
          <i style={{ width: `${Math.round(Math.min(1, Math.max(0, through)) * 100)}%` }} />
        </div>
      ) : null}

      <p className="note">{note}</p>

      <p className="streak-foot">
        {loggedToday ? 'Logged today' : 'Today is still open'}
        {best > 0 && running && best > current ? ` · Best ${best}` : ''}
        {best > 0 && running && current >= best ? ' · Personal best' : ''}
      </p>
    </div>
  );
}

/** The milestone immediately below the next one, so the bar fills across the right span. */
function lastMilestoneBefore(next: number): number {
  const ladder = [0, 3, 5, 10, 20, 40, 60, 100];
  let previous = 0;
  for (const step of ladder) {
    if (step < next) previous = step;
  }
  return previous;
}
