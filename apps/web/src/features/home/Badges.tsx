/**
 * Badges, shown as a quiet row rather than a trophy cabinet.
 *
 * Every badge is a lifetime total or a personal best, so none of them can go backwards. A badge
 * not yet started says what would start it, which is an invitation; it never says "none" or "0
 * of 5" in a way that reads as a scolding.
 */

import type { BadgeDto } from '@gtm/shared';

const ICON: Record<string, string> = {
  consistency: 'M3 16.8 9.5 10.3 13.5 14.3 21 6.8',
  on_target: 'M5 12.5 10 17.5 19 7',
  meetings: 'M4 7h16v13H4zM8 3v5M16 3v5M4 12h16',
  replies: 'M20 8.5a6 6 0 0 1-6 6H8.5L4 18.5V8.5a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6Z',
};

/** Tier names, so the level is spoken as well as drawn. */
const TIER_WORD = ['Not started', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Legend', 'Myth'];

function Badge({ badge }: { badge: BadgeDto }) {
  const earned = badge.tier > 0;
  const word = TIER_WORD[Math.min(badge.tier, TIER_WORD.length - 1)] ?? 'Earned';

  const toGo = badge.nextThreshold === null ? null : badge.nextThreshold - badge.value;
  const note =
    badge.nextThreshold === null
      ? 'Every tier earned'
      : earned
        ? `${toGo} more for the next tier`
        : `${badge.nextThreshold} to start`;

  return (
    <li className={`badge ${earned ? 'badge-on' : 'badge-off'}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d={ICON[badge.key] ?? ICON.on_target}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="badge-text">
        <b>
          {badge.label}
          {earned ? <span className="badge-tier"> · {word}</span> : null}
        </b>
        <span className="badge-note">
          {badge.description}. {note}.
        </span>
      </div>
      <span className="badge-value mono" aria-hidden="true">
        {badge.value}
      </span>
    </li>
  );
}

export function Badges({ badges }: { badges: BadgeDto[] }) {
  if (badges.length === 0) return null;

  const earned = badges.filter((b) => b.tier > 0).length;

  return (
    <section className="card" aria-labelledby="badges-title">
      <div className="card-head">
        <div>
          <h2 id="badges-title" style={{ fontSize: 16, margin: 0 }}>
            Your badges
          </h2>
          <span className="sub">
            {earned === 0
              ? 'Every one of these is still open to you.'
              : `${earned} of ${badges.length} started. Nothing here can be lost.`}
          </span>
        </div>
      </div>
      <ul className="badges">
        {badges.map((badge) => (
          <Badge key={badge.key} badge={badge} />
        ))}
      </ul>
    </section>
  );
}
