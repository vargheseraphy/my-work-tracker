/** The manager dashboard (design/dashboard.html). */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  addDays,
  formatDayShort,
  formatMonth,
  formatNumber,
  formatWeek,
  formatWeekRange,
  monthStart,
  pace,
  weekMonday,
  type ComplianceDto,
  type DashboardDto,
  type PipelineRowDto,
} from '@gtm/shared';
import { api } from '../../api.js';
import { useUser } from '../../auth.jsx';
import { ComplianceGrid, ImpressionsChart } from '../../components/data.jsx';
import {
  Banner,
  Button,
  Card,
  CardHead,
  Empty,
  LinkButton,
  Loading,
  PaceDot,
  PageHead,
  Pill,
  Scrollable,
  StatCard,
} from '../../components/ui.jsx';

export function Dashboard() {
  const user = useUser();
  const [monday, setMonday] = useState(() => weekMonday(user.today));
  // The grid has its own month, because a week can straddle a month end.
  const [month, setMonth] = useState(() => user.today.slice(0, 7));

  const week = useQuery({
    queryKey: ['admin', 'week', monday],
    queryFn: () => api.get<DashboardDto>(`/admin/week?monday=${monday}`),
  });

  const compliance = useQuery({
    queryKey: ['admin', 'compliance', month],
    queryFn: () => api.get<ComplianceDto>(`/admin/compliance?month=${month}`),
  });

  if (week.isPending) return <Loading what="Building the dashboard" />;
  const data = week.data;
  if (!data) return <Empty>The dashboard could not be loaded.</Empty>;

  const thisWeekAbm = data.abm.at(-1);
  const measures = data.people[0]?.targets ?? [];

  return (
    <>
      <PageHead
        eyebrow={formatWeekRange(monday)}
        title="GTM team dashboard"
        actions={
          <div className="row wrap">
            <Button small onClick={() => setMonday(addDays(monday, -7))}>
              Previous week
            </Button>
            <Button small onClick={() => setMonday(weekMonday(user.today))}>
              This week
            </Button>
            <Button small onClick={() => setMonday(addDays(monday, 7))}>
              Next week
            </Button>
            <LinkButton to={`/report/${monday}`} tone="primary" small>
              Weekly report
            </LinkButton>
          </div>
        }
      />

      <div className="grid g4">
        <StatCard
          kicker="Logs this week"
          stat={`${data.kpis.logsDone} of ${data.kpis.logsExpected}`}
          note={`${data.weekDaysDone} of ${data.weekDaysTotal} working days gone`}
        />
        <StatCard
          kicker="Missing"
          stat={formatNumber(data.kpis.missingCount)}
          note={data.kpis.missingLabel ?? 'Nothing outstanding'}
        />
        <StatCard
          kicker="Overdue tasks"
          stat={formatNumber(data.kpis.overdueTasks)}
          note={`${data.kpis.openTasks} open across the team`}
        />
        <StatCard
          kicker="Weekly logs last week"
          stat={`${data.kpis.weeklyLogsDone} of ${data.kpis.weeklyLogsExpected}`}
          note={
            data.kpis.weeklyLogsDone === data.kpis.weeklyLogsExpected
              ? 'All in'
              : 'Some still to come'
          }
        />
      </div>

      <Card as="section">
        <CardHead
          title="Did everyone log?"
          actions={
            <div className="row">
              <Button small onClick={() => setMonth(shiftMonth(month, -1))}>
                Previous month
              </Button>
              <span className="small muted" style={{ minWidth: 120, textAlign: 'center' }}>
                {formatMonth(month)}
              </span>
              <Button small onClick={() => setMonth(shiftMonth(month, 1))}>
                Next month
              </Button>
            </div>
          }
        />
        {compliance.isPending ? (
          <Loading />
        ) : compliance.data ? (
          <ComplianceGrid data={compliance.data} />
        ) : (
          <Empty>The grid could not be loaded.</Empty>
        )}
      </Card>

      <Card as="section">
        <CardHead
          title="Did they hit target? This week so far"
          sub={`Pro rata: ${data.weekDaysDone} of ${data.weekDaysTotal} working days gone. The dot shows pace.`}
        />
        {data.people.length === 0 || measures.length === 0 ? (
          <Empty>No targets are set yet.</Empty>
        ) : (
          <Scrollable label="Each person against their weekly targets">
            <table className="table">
              <caption className="sr-only">Each person against their weekly targets</caption>
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  {measures.map((measure) => (
                    <th
                      key={measure.metricKey}
                      scope="col"
                      className="num"
                      style={{ whiteSpace: 'normal', maxWidth: 110 }}
                    >
                      {measure.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.people.map((person) => (
                  <tr key={person.userId}>
                    <td>
                      <Link to={`/people/${person.userId}`}>
                        <b className="small">{person.fullName}</b>
                      </Link>
                    </td>
                    {person.targets.map((target) => {
                      const result = pace(
                        target.actual,
                        target.target,
                        data.weekDaysDone,
                        data.weekDaysTotal,
                      );
                      return (
                        <td key={target.metricKey} className="num">
                          <span className="stack" style={{ gap: 2, alignItems: 'flex-end' }}>
                            <span className="mono" style={{ whiteSpace: 'nowrap' }}>
                              {formatNumber(target.actual)}
                              {target.target === null ? '' : ` / ${formatNumber(target.target)}`}
                            </span>
                            <PaceDot level={result.level} word={result.word} />
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Scrollable>
        )}
      </Card>

      <div className="grid g2">
        <Card as="section">
          <CardHead title="Is it turning into pipeline?" sub="This week against the week before" />
          <Scrollable label="Pipeline measures this week and last">
            <table className="table">
              <caption className="sr-only">Pipeline measures this week and last</caption>
              <thead>
                <tr>
                  <th scope="col">Measure</th>
                  <th scope="col" className="num">
                    This week
                  </th>
                  <th scope="col" className="num">
                    Week before
                  </th>
                  <th scope="col" className="num">
                    Change
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.pipeline.map((row) => (
                  <PipelineRow key={row.key} row={row} />
                ))}
              </tbody>
            </table>
          </Scrollable>
        </Card>

        <Card as="section">
          <CardHead title="Impressions, last 12 weeks" sub="Team total" />
          <ImpressionsChart points={data.impressions} />
        </Card>
      </div>

      <div className="grid g2">
        <Card as="section">
          <CardHead
            title="ABM"
            actions={
              <LinkButton to="/abm" small>
                Open tracker
              </LinkButton>
            }
          />
          {thisWeekAbm && !thisWeekAbm.account ? (
            <Banner
              tone="warn"
              title="No account is planned for this week"
              body="The one-a-week plan needs an account."
            />
          ) : thisWeekAbm && !thisWeekAbm.account?.isLive ? (
            <Banner
              tone="warn"
              title="This week's account is not live yet"
              body={`${thisWeekAbm.account!.name} is at ${thisWeekAbm.account!.stage}. Due live by Friday.`}
            />
          ) : null}

          <Scrollable label="ABM accounts by week" style={{ marginTop: 12 }}>
            <table className="table">
              <caption className="sr-only">ABM accounts by week</caption>
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Stage</th>
                  <th scope="col" className="num">
                    Weeks live
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...data.abm]
                  .reverse()
                  .slice(0, 6)
                  .map((week) => (
                    <tr key={week.week}>
                      <td>
                        {week.account ? (
                          <b className="small">{week.account.name}</b>
                        ) : (
                          <span className="small" style={{ color: 'var(--bad)' }}>
                            No account · {formatWeek(week.week).replace('Week of ', '')}
                          </span>
                        )}
                      </td>
                      <td className="small">{week.account?.ownerName ?? '—'}</td>
                      <td>
                        {week.account ? (
                          <Pill tone={week.account.isLive ? 'good' : 'warn'}>
                            {week.account.stage}
                          </Pill>
                        ) : (
                          <Pill tone="bad">Missed</Pill>
                        )}
                      </td>
                      <td className="num">
                        {week.account ? (data.abmWeeksLive[week.account.id] ?? 0) : 0}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Scrollable>
          <p className="xs faint" style={{ marginTop: 12 }}>
            {data.abm.filter((w) => !w.missed).length} of {data.abm.length} weeks on plan.
          </p>
        </Card>

        <Card as="section">
          <CardHead
            title="Backlog"
            actions={
              user.role === 'admin' ? (
                <LinkButton to="/admin/tasks" small>
                  Manage tasks
                </LinkButton>
              ) : undefined
            }
          />
          <Scrollable label="Backlog per person">
            <table className="table">
              <caption className="sr-only">Backlog per person</caption>
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col" className="num">
                    Open
                  </th>
                  <th scope="col" className="num">
                    Overdue
                  </th>
                  <th scope="col" className="num">
                    Done
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.backlog.map((row) => (
                  <tr key={row.userId}>
                    <td className="small">{row.fullName}</td>
                    <td className="num">{row.open}</td>
                    <td
                      className="num"
                      style={row.overdue > 0 ? { color: 'var(--bad)' } : undefined}
                    >
                      {row.overdue}
                    </td>
                    <td className="num">{row.done}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scrollable>

          {data.overdue.length > 0 ? (
            <>
              <h3 style={{ margin: '16px 0 8px' }}>Overdue</h3>
              <div className="stack" style={{ gap: 8 }}>
                {data.overdue.slice(0, 4).map((task) => (
                  <div
                    className="card tight between"
                    key={task.id}
                    style={{ background: 'var(--bad-bg)', borderColor: 'var(--bad-line)' }}
                  >
                    <div className="stack" style={{ gap: 2 }}>
                      <b className="small">{task.title}</b>
                      <span className="xs muted">
                        {task.assigneeName} · was due {formatDayShort(task.dueDate)}
                      </span>
                    </div>
                    <Pill tone={task.status === 'Blocked' ? 'bad' : 'plain'}>{task.status}</Pill>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </Card>
      </div>

      <Card as="section">
        <CardHead title="Search activity" sub="SEO, AEO and GEO, from the weekly logs" />
        {data.searchActivities.length === 0 ? (
          <Empty>Nothing logged in the last four weeks.</Empty>
        ) : (
          <Scrollable label="Search activity">
            <table className="table">
              <caption className="sr-only">Search activity</caption>
              <thead>
                <tr>
                  <th scope="col">Type</th>
                  <th scope="col">What was done</th>
                  <th scope="col">By</th>
                  <th scope="col">Week</th>
                </tr>
              </thead>
              <tbody>
                {data.searchActivities.slice(0, 12).map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Pill tone="info">{row.kind}</Pill>
                    </td>
                    <td className="small">
                      {row.link ? (
                        <a href={row.link} target="_blank" rel="noopener noreferrer">
                          {row.description}
                        </a>
                      ) : (
                        row.description
                      )}
                    </td>
                    <td className="small">{row.userName}</td>
                    <td className="small muted">
                      {formatWeek(row.week).replace('Week of ', '')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scrollable>
        )}
      </Card>

      <Card as="section">
        <CardHead title="Outcomes week on week" sub="Last 8 weeks" />
        <Scrollable label="Outcomes week on week">
          <table className="table">
            <caption className="sr-only">Outcomes week on week</caption>
            <thead>
              <tr>
                <th scope="col">Week</th>
                <th scope="col" className="num">
                  Meetings
                </th>
                <th scope="col" className="num">
                  Replies
                </th>
                <th scope="col" className="num">
                  Accounts
                </th>
                <th scope="col" className="num">
                  Emails
                </th>
              </tr>
            </thead>
            <tbody>
              {[...data.outcomes].reverse().map((row) => (
                <tr key={row.week}>
                  <td>{formatWeek(row.week).replace('Week of ', '')}</td>
                  <td className="num">{formatNumber(row.meetings)}</td>
                  <td className="num">{formatNumber(row.replies)}</td>
                  <td className="num">{formatNumber(row.accountsAdded)}</td>
                  <td className="num">{formatNumber(row.emails)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scrollable>
      </Card>
    </>
  );
}

function PipelineRow({ row }: { row: PipelineRowDto }) {
  const change = row.thisWeek - row.lastWeek;
  const word =
    row.unit === 'percent'
      ? `${change > 0 ? '+' : ''}${change} pts`
      : `${change > 0 ? '+' : ''}${formatNumber(change)}`;

  return (
    <tr>
      <td className="small">{row.label}</td>
      <td className="num">
        <b>
          {formatNumber(row.thisWeek)}
          {row.unit === 'percent' ? '%' : ''}
        </b>
      </td>
      <td className="num muted">
        {formatNumber(row.lastWeek)}
        {row.unit === 'percent' ? '%' : ''}
      </td>
      <td
        className="num"
        style={{ color: change > 0 ? 'var(--good)' : change < 0 ? 'var(--bad)' : undefined }}
      >
        {change === 0 ? 'No change' : word}
      </td>
    </tr>
  );
}

function shiftMonth(month: string, by: number): string {
  const date = new Date(`${monthStart(month)}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + by);
  return date.toISOString().slice(0, 7);
}
