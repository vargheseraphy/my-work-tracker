/**
 * The hero product shot: a full dashboard drawn in the page from the real tokens, inside a
 * window frame.
 *
 * Drawn rather than photographed on purpose. It cannot go stale when the app changes, it follows
 * light and dark with everything else, and it never puts real people's numbers on a public page.
 * The names are invented and the figures are illustrative.
 */

const PEOPLE = [
  { name: 'Tanzil', days: 'SSSSS·SSSLS·SSSSS·SS', done: '10 of 10' },
  { name: 'Anil', days: 'SSSSS·SSSSS·SSMSS·SS', done: '9 of 10' },
  { name: 'Tamre', days: 'SSLSS·SSSSS·SSSSS·SS', done: '10 of 10' },
];

const TARGETS = [
  { label: 'Emails sent', actual: '142', target: '150', share: 95, word: 'On pace', tone: '' },
  { label: 'Posts published', actual: '3', target: '5', share: 60, word: 'Behind', tone: 'behind' },
  { label: 'Meetings booked', actual: '4', target: '3', share: 100, word: 'On pace', tone: '' },
  { label: 'Accounts added', actual: '18', target: '25', share: 72, word: 'Close', tone: 'behind' },
  { label: 'Replies received', actual: '31', target: '30', share: 100, word: 'On pace', tone: '' },
];

const KPIS = [
  { label: 'Logs this week', value: '28', sub: 'of 30 · 3 of 5 days gone', tone: 'c1' },
  { label: 'Missing', value: '2', sub: 'Anil · Wed 08 Oct', tone: 'c4' },
  { label: 'Meetings booked', value: '11', sub: 'Up from 7 last week', tone: 'c3' },
  { label: 'Overdue tasks', value: '3', sub: 'Across the team', tone: 'c5' },
];

export function DashboardShot() {
  return (
    <div className="shot" data-reveal>
      <div className="shot-frame">
        <div className="shot-bar" aria-hidden="true">
          <span className="shot-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="shot-url">repotra.app/dashboard</span>
        </div>

        <div className="shot-body">
          <aside className="shot-side" aria-hidden="true">
            <span className="shot-logo" />
            {['Dashboard', 'Weekly report', 'People', 'Tasks', 'ABM'].map((item, i) => (
              <span className={`shot-nav${i === 0 ? ' on' : ''}`} key={item}>
                {item}
              </span>
            ))}
          </aside>

          <div className="shot-main">
            <div className="shot-head">
              <span className="shot-eyebrow">12 OCT TO 16 OCT</span>
              <h3>GTM team dashboard</h3>
            </div>

            <div className="shot-kpis">
              {KPIS.map((kpi) => (
                <div className="shot-kpi glass" key={kpi.label}>
                  <span className="shot-kpi-label">
                    <i className={`shot-chip ${kpi.tone}`} />
                    {kpi.label}
                  </span>
                  <b>{kpi.value}</b>
                  <span className="shot-kpi-sub">{kpi.sub}</span>
                </div>
              ))}
            </div>

            <div className="shot-cols">
              <section className="shot-card">
                <h4>Did everyone log?</h4>
                {PEOPLE.map((person) => (
                  <div className="shot-row" key={person.name}>
                    <span className="shot-name">{person.name}</span>
                    <span className="shot-cells">
                      {[...person.days].map((mark, index) => (
                        <i
                          key={`${person.name}-${index}`}
                          className={`shot-cell ${
                            mark === 'S'
                              ? 'sub'
                              : mark === 'L'
                                ? 'late'
                                : mark === 'M'
                                  ? 'miss'
                                  : 'off'
                          }`}
                        />
                      ))}
                    </span>
                    <span className="shot-done">{person.done}</span>
                  </div>
                ))}
              </section>

              <section className="shot-card">
                <h4>This week against target</h4>
                {TARGETS.map((row) => (
                  <div className="shot-target" key={row.label}>
                    <span className="shot-target-top">
                      <span>{row.label}</span>
                      <span className="shot-num">
                        {row.actual} / {row.target} · {row.word}
                      </span>
                    </span>
                    <span className="shot-bar-track">
                      <i className={row.tone} style={{ width: `${row.share}%` }} />
                    </span>
                  </div>
                ))}
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
