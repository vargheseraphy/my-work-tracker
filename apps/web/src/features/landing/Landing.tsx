/**
 * The public face of Repotra, shown at / to anyone who is not signed in.
 *
 * The product shots are drawn in the page from the same tokens the app uses, not pasted
 * screenshots. That way they cannot go stale, they follow light and dark, and nothing here
 * claims to be a real screen of real people's numbers.
 *
 * Bands alternate light and dark by putting `theme-dark` on a section, which re-declares the
 * palette for that subtree only.
 */

import { Link } from 'react-router-dom';
import { Logo } from '../../components/AppShell.jsx';

export function Landing() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <span className="lp-brand">
          <Logo size={24} />
          <b>Repotra</b>
        </span>
        <Link className="btn btn-primary btn-sm" to="/signin">
          Sign in
        </Link>
      </header>

      {/* ---------- hero, light ---------- */}
      <section className="lp-hero">
        <div className="lp-wrap lp-hero-in">
          <span className="eyebrow">Daily activity, weekly results</span>
          <h1>Stop chasing your team for updates.</h1>
          <p className="lp-lead">
            Repotra is where a go-to-market team logs what they did each day, and where their
            manager sees the week take shape without asking anyone a thing. The rules live in the
            database, so the numbers you read are the numbers that happened.
          </p>
          <div className="row wrap" style={{ gap: 12 }}>
            <Link className="btn btn-primary" to="/signin">
              Sign in
            </Link>
            <a className="btn" href="#how">
              See how it works
            </a>
          </div>
          <p className="xs muted" style={{ marginTop: 4 }}>
            Invite only. Your admin sets up accounts.
          </p>
        </div>
      </section>

      {/* ---------- the problem, light ---------- */}
      <section className="lp-wrap lp-band">
        <h2 className="lp-h2">The Monday morning problem</h2>
        <div className="lp-three">
          <article>
            <h3>You ask, they guess</h3>
            <p>
              Numbers get reconstructed from memory on a Friday afternoon. Nobody is lying; they
              simply cannot remember Tuesday.
            </p>
          </article>
          <article>
            <h3>The spreadsheet rots</h3>
            <p>
              One person edits the wrong row, another overwrites a formula, and by week three
              nobody trusts the totals enough to act on them.
            </p>
          </article>
          <article>
            <h3>You become the chaser</h3>
            <p>
              The most expensive person on the team spends Monday sending reminders instead of
              reading results.
            </p>
          </article>
        </div>
      </section>

      {/* ---------- the dashboard, dark ---------- */}
      <section className="theme-dark lp-dark" id="how">
        <div className="lp-wrap">
          <span className="eyebrow">Your Monday view</span>
          <h2 className="lp-h2">Who logged, who is on pace, what is stuck</h2>
          <p className="lp-lead">
            One screen answers the three questions you would otherwise ask in a stand-up.
          </p>

          <div className="lp-shot">
            <ComplianceShot />
            <PaceShot />
          </div>
        </div>
      </section>

      {/* ---------- features, light ---------- */}
      <section className="lp-wrap lp-band">
        <h2 className="lp-h2">What it does</h2>
        <ul className="lp-features">
          {FEATURES.map((feature) => (
            <li key={feature.title}>
              <b>{feature.title}</b>
              <span>{feature.body}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- for the team, dark ---------- */}
      <section className="theme-dark lp-dark">
        <div className="lp-wrap">
          <span className="eyebrow">For the people doing the work</span>
          <h2 className="lp-h2">A tracker people are willing to open</h2>
          <p className="lp-lead">
            Compliance tools get filled in badly because they feel like surveillance. Repotra is
            built the other way round: it shows people their own progress first.
          </p>
          <div className="lp-shot">
            <StreakShot />
            <div className="lp-points">
              <p>
                <b>Consistency, not punctuality.</b> A streak counts days logged, late or not.
                Leave and weekends are skipped, never broken.
              </p>
              <p>
                <b>Nothing can be taken away.</b> Badges are lifetime totals and personal bests,
                so a quiet fortnight never demotes anyone.
              </p>
              <p>
                <b>A missed day is a nudge.</b> It never locks today. The gap still shows to the
                manager, but it does not stop the work.
              </p>
              <p>
                <b>An honest zero is welcome.</b> Low numbers are safe to report, which is the
                only thing that keeps the data real.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- what a manager gets back, light ---------- */}
      <section className="lp-wrap lp-band">
        <h2 className="lp-h2">What you get back</h2>
        <div className="lp-three">
          <article>
            <h3>Monday morning, already written</h3>
            <p>
              The weekly report builds itself from the week&apos;s logs and lands in your inbox at
              09:00 on Monday. You read it; you do not assemble it.
            </p>
          </article>
          <article>
            <h3>Pace, not just totals</h3>
            <p>
              Every target is measured against how much of the week has actually gone, so Tuesday
              is judged against Tuesday rather than against Friday.
            </p>
          </article>
          <article>
            <h3>The chasing is automatic</h3>
            <p>
              Reminders go out on their own schedule in each person&apos;s own time zone. You stop
              being the reason anything gets filled in.
            </p>
          </article>
        </div>
      </section>

      {/* ---------- close ---------- */}
      <section className="lp-wrap lp-close">
        <h2 className="lp-h2">Ready when you are</h2>
        <p className="lp-lead">
          Accounts are invite only, so ask your admin to add you, or sign in if you already have
          an account.
        </p>
        <Link className="btn btn-primary" to="/signin">
          Sign in
        </Link>
      </section>

      <footer className="lp-foot">
        <span className="lp-brand">
          <Logo size={18} />
          <b>Repotra</b>
        </span>
        <span className="xs muted">Daily activity, weekly results.</span>
      </footer>
    </div>
  );
}

const FEATURES = [
  {
    title: 'Daily and weekly logs',
    body: 'A short form per working day, and a weekly log that totals the days up for you rather than asking twice.',
  },
  {
    title: 'Rules the app cannot bypass',
    body: 'Required fields, whole numbers, sanity checks on sudden spikes. They run in the database, so every route obeys them.',
  },
  {
    title: 'Compliance at a glance',
    body: 'A month grid of who logged and who did not, with late marked separately from missing.',
  },
  {
    title: 'Targets with pace',
    body: 'Weekly targets per person per measure, shown as on pace, close or behind, in words as well as colour.',
  },
  {
    title: 'Task backlog',
    body: 'Assign work with a due date, require a note to block it and proof to finish it, and keep the whole history.',
  },
  {
    title: 'ABM tracker',
    body: 'One named account taken live each week, with the weeks that slipped shown plainly.',
  },
  {
    title: 'Reminders that respect time zones',
    body: 'Each person is nudged in their own working day, once per thing, never twice.',
  },
  {
    title: 'Everything exports',
    body: 'A printable weekly report and a monthly CSV, so the data is never trapped in here.',
  },
];

/* ---------- drawn product shots ---------- */

/** A month of the compliance grid. The pattern is illustrative, not anyone's real month. */
function ComplianceShot() {
  const people = [
    { name: 'Tanzil', days: 'SSSLS·SSSSS·SMSSS·SS' },
    { name: 'Anil', days: 'SSSSS·SSLSS·SSSSS·SS' },
    { name: 'Tamre', days: 'SSLSS·SSSSM·SSSSS·SS' },
  ];

  return (
    <figure className="lp-card">
      <figcaption>Did everyone log?</figcaption>
      <div className="lp-grid-rows">
        {people.map((person) => (
          <div className="lp-grid-row" key={person.name}>
            <span>{person.name}</span>
            <div className="lp-cells">
              {[...person.days].map((mark, index) =>
                mark === '·' ? (
                  <i className="lp-cell off" key={`${person.name}-${index}`} />
                ) : (
                  <i
                    key={`${person.name}-${index}`}
                    className={`lp-cell ${mark === 'S' ? 'sub' : mark === 'L' ? 'late' : 'miss'}`}
                  />
                ),
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="lp-legend">
        <span>
          <i className="lp-cell sub" /> Submitted
        </span>
        <span>
          <i className="lp-cell late" /> Late
        </span>
        <span>
          <i className="lp-cell miss" /> Missing
        </span>
      </div>
    </figure>
  );
}

/** This week against target, the way the dashboard draws it. */
function PaceShot() {
  const rows = [
    { label: 'Emails sent', actual: 142, target: 150, share: 0.95, word: 'On pace' },
    { label: 'Posts published', actual: 3, target: 5, share: 0.6, word: 'Behind' },
    { label: 'Meetings booked', actual: 4, target: 3, share: 1, word: 'On pace' },
    { label: 'Accounts added', actual: 18, target: 25, share: 0.72, word: 'Close' },
  ];

  return (
    <figure className="lp-card">
      <figcaption>This week against target</figcaption>
      <div className="lp-pace">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="between small">
              <span>{row.label}</span>
              <span className="mono muted">
                {row.actual} / {row.target} · {row.word}
              </span>
            </div>
            <div className="bar">
              <i
                className={row.word === 'On pace' ? '' : 'behind'}
                style={{ width: `${Math.round(row.share * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}

/** The contributor's own card, which is the first thing they see. */
function StreakShot() {
  return (
    <figure className="lp-card lp-card-tight">
      <figcaption>Consistency</figcaption>
      <div className="row" style={{ gap: 10 }}>
        <span style={{ fontSize: 26 }} aria-hidden="true">
          🔥
        </span>
        <span className="stat">12 days</span>
      </div>
      <div className="bar" style={{ marginTop: 10 }}>
        <i style={{ width: '60%', background: 'var(--c4)' }} />
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>
        8 more days to reach 20.
      </p>
      <p className="xs mono muted">LOGGED TODAY · PERSONAL BEST</p>
    </figure>
  );
}
