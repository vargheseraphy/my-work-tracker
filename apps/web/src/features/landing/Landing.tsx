/**
 * The public face of Repotra, at / for anyone not signed in.
 *
 * Built to the brand manual: glass only ever sits on an orb ground, one accent action per view,
 * tight corners, and every text tone at full ink. The product shots are drawn from the same
 * tokens the app uses, so they cannot go stale and never show real people's numbers.
 *
 * Every animation is decoration and sits behind prefers-reduced-motion.
 */

import { Link } from 'react-router-dom';
import { Logo } from '../../components/AppShell.jsx';
import { DashboardShot } from './DashboardShot.jsx';
import { useReveal } from './useReveal.js';

export function Landing() {
  useReveal();

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-nav-in">
          <span className="lp-brand">
            <Logo size={24} />
            <b>Repotra</b>
          </span>
          <nav className="lp-nav-links" aria-label="Page sections">
            <a href="#product">Product</a>
            <a href="#features">Features</a>
            <a href="#team">For your team</a>
          </nav>
          <Link className="btn btn-primary btn-sm" to="/signin">
            Sign in
          </Link>
        </div>
      </header>

      {/* 1 ─ hero */}
      <section className="theme-dark lp-hero">
        <Orbs />
        <div className="lp-wrap lp-hero-in">
          <span className="lp-pill" data-reveal>
            <i className="lp-pill-dot" />
            Daily activity, weekly results
          </span>
          <h1 data-reveal>
            Stop chasing your team
            <br />
            for <em>updates</em>.
          </h1>
          <p className="lp-lead" data-reveal>
            Repotra is where a go-to-market team logs what they did, and where you see the week
            take shape without asking anyone a thing. The rules live in the database, so the
            numbers you read are the numbers that happened.
          </p>
          <div className="lp-cta" data-reveal>
            <Link className="btn btn-primary lp-btn-lg" to="/signin">
              Sign in
            </Link>
            <a className="btn lp-btn-lg lp-btn-glass" href="#product">
              See the dashboard
            </a>
          </div>
          <p className="lp-fine" data-reveal>
            Invite only · Your admin creates accounts
          </p>
        </div>
      </section>

      {/* 2 ─ proof strip */}
      <section className="theme-dark lp-strip">
        <div className="lp-wrap lp-strip-in">
          {[
            { big: '3 brands', small: 'tracked separately, by whoever runs them' },
            { big: '09:00 Monday', small: 'the week already written, in your inbox' },
            { big: 'Zero chasing', small: 'reminders go out in each person’s time zone' },
          ].map((item) => (
            <div key={item.big} data-reveal>
              <b>{item.big}</b>
              <span>{item.small}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 3 ─ the pain */}
      <section className="lp-band" id="pain">
        <div className="lp-wrap">
          <header className="lp-head" data-reveal>
            <span className="eyebrow">The Monday morning problem</span>
            <h2>You are the reason anything gets filled in.</h2>
            <p className="lp-lead">
              Every manager running a spreadsheet ends up in the same three places.
            </p>
          </header>

          <div className="lp-cards">
            {PAINS.map((pain) => (
              <article className="lp-card" key={pain.title} data-reveal>
                <span className="lp-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d={pain.icon} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <h3>{pain.title}</h3>
                <p>{pain.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 4 ─ the product shot */}
      <section className="theme-dark lp-product" id="product">
        <Orbs />
        <div className="lp-wrap">
          <header className="lp-head lp-head-centre" data-reveal>
            <span className="eyebrow">Your Monday view</span>
            <h2>Who logged, who is on pace, what is stuck.</h2>
            <p className="lp-lead">
              One screen answers the three questions you would otherwise ask in a stand-up.
            </p>
          </header>
          <DashboardShot />
        </div>
      </section>

      {/* 5 ─ features */}
      <section className="lp-band" id="features">
        <div className="lp-wrap">
          <header className="lp-head" data-reveal>
            <span className="eyebrow">What it does</span>
            <h2>Everything the spreadsheet could not.</h2>
          </header>
          <div className="lp-bento">
            {FEATURES.map((feature, i) => (
              <article
                className={`lp-tile${i === 0 ? ' lp-tile-wide' : ''}`}
                key={feature.title}
                data-reveal
              >
                <span className="lp-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d={feature.icon} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 6 ─ how it works */}
      <section className="theme-dark lp-steps">
        <Orbs />
        <div className="lp-wrap">
          <header className="lp-head" data-reveal>
            <span className="eyebrow">How it works</span>
            <h2>Three moving parts. That is the whole of it.</h2>
          </header>
          <ol className="lp-step-list">
            {STEPS.map((step, i) => (
              <li key={step.title} data-reveal>
                <span className="lp-step-n">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 7 ─ for the team */}
      <section className="lp-band" id="team">
        <div className="lp-wrap">
          <header className="lp-head" data-reveal>
            <span className="eyebrow">For the people doing the work</span>
            <h2>A tracker people are willing to open.</h2>
            <p className="lp-lead">
              Compliance tools get filled in badly because they feel like surveillance. Repotra
              shows people their own progress first.
            </p>
          </header>

          <div className="lp-split">
            <div className="lp-mini-cards" data-reveal>
              <figure className="lp-mini">
                <figcaption>Consistency</figcaption>
                <div className="lp-mini-top">
                  <span aria-hidden="true">🔥</span>
                  <b>12 days</b>
                </div>
                <span className="lp-mini-bar">
                  <i style={{ width: '60%' }} />
                </span>
                <span className="lp-mini-note">8 more days to reach 20</span>
              </figure>
              <figure className="lp-mini lp-mini-on">
                <figcaption>On target · Gold</figcaption>
                <div className="lp-mini-top">
                  <b>6 weeks</b>
                </div>
                <span className="lp-mini-note">Every target met, six weeks running</span>
              </figure>
            </div>

            <div className="lp-points" data-reveal>
              {POINTS.map((point) => (
                <p key={point.b}>
                  <b>{point.b}</b> {point.p}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 8 ─ close */}
      <section className="theme-dark lp-close">
        <Orbs />
        <div className="lp-wrap lp-close-in" data-reveal>
          <h2>Give your Monday back.</h2>
          <p className="lp-lead">
            Accounts are invite only. Ask your admin to add you, or sign in if you already have
            one.
          </p>
          <Link className="btn btn-primary lp-btn-lg" to="/signin">
            Sign in
          </Link>
        </div>
      </section>

      <footer className="theme-dark lp-foot">
        <div className="lp-wrap lp-foot-in">
          <span className="lp-brand">
            <Logo size={18} />
            <b>Repotra</b>
          </span>
          <span className="lp-fine">Daily activity, weekly results.</span>
        </div>
      </footer>
    </div>
  );
}

/** Three drifting orbs. Decorative, and the only thing on the page that moves on its own. */
function Orbs() {
  return (
    <div className="lp-orbs" aria-hidden="true">
      <span className="lp-orb o1" />
      <span className="lp-orb o2" />
      <span className="lp-orb o3" />
    </div>
  );
}

const PAINS = [
  {
    title: 'You ask, they guess',
    body: 'Numbers get reconstructed from memory on a Friday afternoon. Nobody is lying; they simply cannot remember Tuesday.',
    icon: 'M12 8.5v4.5M12 16.5h.01M12 3.2 2.6 20h18.8Z',
  },
  {
    title: 'The spreadsheet rots',
    body: 'One person edits the wrong row, another overwrites a formula, and by week three nobody trusts the totals enough to act on them.',
    icon: 'M4 5.5h16v14H4zM4 10h16M9.5 10v9.5M15 14l4 4M19 14l-4 4',
  },
  {
    title: 'You become the chaser',
    body: 'The most expensive person on the team spends Monday sending reminders instead of reading results.',
    icon: 'M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  },
];

const FEATURES = [
  {
    title: 'Rules the app cannot bypass',
    body: 'Required fields, whole numbers, a flag on sudden spikes, proof where proof matters. They run inside the database, so every route and every integration obeys them. There is no back door, including for us.',
    icon: 'M12 3.2 20 6.6v5.2c0 4.6-3.3 8.4-8 9.4-4.7-1-8-4.8-8-9.4V6.6ZM9 12.2l2.2 2.3L15.5 10',
  },
  {
    title: 'Activity per brand',
    body: 'Run three accounts? Log LinkedIn and email against each one, with the totals still rolling up.',
    icon: 'M4 7h7v7H4zM13 4h7v7h-7zM13 13h7v7h-7zM4 16h7v4H4z',
  },
  {
    title: 'Targets with pace',
    body: 'Tuesday is judged against Tuesday, not against Friday. On pace, close or behind, in words as well as colour.',
    icon: 'M12 20.5a8.5 8.5 0 1 0-8.5-8.5M12 12l5-4.5M12 12v4',
  },
  {
    title: 'Compliance at a glance',
    body: 'A month grid of who logged and who did not, with late kept separate from missing.',
    icon: 'M4 6.5h16v14H4zM8 3v5M16 3v5M4 11h16M9 15.5l2 2 4-4',
  },
  {
    title: 'Reminders that respect time zones',
    body: 'Each person is nudged inside their own working day, once per thing, never twice.',
    icon: 'M12 7v5.2l3.2 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  },
  {
    title: 'Everything exports',
    body: 'A printable weekly report and a monthly CSV. The data is never trapped in here.',
    icon: 'M12 3.5v11M8 11l4 4 4-4M4 19.5h16',
  },
];

const STEPS = [
  {
    title: 'They log the day',
    body: 'A short form per working day, a couple of minutes. Late still counts, and a missed day never blocks the next one.',
  },
  {
    title: 'The week assembles itself',
    body: 'Daily numbers roll into the weekly log, totals already filled in. Nobody is asked for the same figure twice.',
  },
  {
    title: 'You read, you do not assemble',
    body: 'The dashboard is live all week and the report lands on Monday at nine. Your job goes back to deciding things.',
  },
];

const POINTS = [
  {
    b: 'Consistency, not punctuality.',
    p: 'A streak counts days logged, late or not. Leave and weekends are skipped, never broken.',
  },
  {
    b: 'Nothing can be taken away.',
    p: 'Badges are lifetime totals and personal bests, so a quiet fortnight never demotes anyone.',
  },
  {
    b: 'A missed day is a nudge.',
    p: 'It never locks today. The gap still shows to you, but it does not stop the work.',
  },
  {
    b: 'An honest zero is welcome.',
    p: 'Low numbers are safe to report, which is the only thing that keeps the data real.',
  },
];
