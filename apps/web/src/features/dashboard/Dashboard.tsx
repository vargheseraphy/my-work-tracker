/** The manager dashboard (design/dashboard.html). */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  addDays,
  formatNumber,
  formatMonth,
  formatWeek,
  formatWeekRange,
  monthStart,
  growth,
  formatGrowth,
  pace,
  targetShare,
  weekMonday,
  type ComplianceDto,
  type DashboardDto,
} from '@gtm/shared';
import { api } from '../../api.js';
import { useUser } from '../../auth.jsx';
import { ComplianceGrid, ImpressionsChart } from '../../components/data.jsx';
import {
  Button,
  Card,
  CardHead,
  Empty,
  LinkButton,
  Loading,
  PaceDot,
  PageHead,
  Pill,
  StatCard,
  Scrollable,
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

  const previous = data.outcomes.at(-2);
  const current = data.outcomes.at(-1);

  return (
    <>
      <PageHead
        eyebrow={formatWeekRange(monday)}
        title="GTM dashboard"
        actions={
          <div className="row">
            <Button small onClick={() => setMonday(addDays(monday, -7))}>
              Previous week
            </Button>
            <Button small onClick={() => setMonday(weekMonday(user.today))}>
              This week
            </Button>
            <Button small onClick={() => setMonday(addDays(monday, 7))}>
              Next week
            </Button>
            <LinkButton to={`/report/${monday}`} small>
              Weekly report
            </LinkButton>
          </div>
        }
      />

      <div className="grid g4">
        <StatCard
          kicker="Compliance"
          stat={`${data.kpis.complianceRate}%`}
          note={`${data.kpis.submittedToday} of the expected days signed off`}
        />
        <StatCard
          kicker="Meetings booked"
          stat={formatNumber(data.kpis.meetingsThisWeek)}
          note={
            previous && current
              ? `${formatGrowth(growth(current.meetings, previous.meetings))} on last week`
              : 'This week so far'
          }
        />
        <StatCard
          kicker="Replies"
          stat={formatNumber(data.kpis.repliesThisWeek)}
          note={
            previous && current
              ? `${formatGrowth(growth(current.replies, previous.replies))} on last week`
              : 'This week so far'
          }
        />
        <StatCard
          kicker="Backlog"
          stat={`${data.kpis.openTasks} open`}
          note={`${data.kpis.overdueTasks} overdue`}
          action={
            user.role === 'admin' ? (
              <LinkButton to="/admin/tasks" small>
                Manage tasks
              </LinkButton>
            ) : undefined
          }
        />
      </div>

      <Card as="section">
        <CardHead
          title="Daily sign-off"
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
        <CardHead title="This week against target" sub={formatWeekRange(monday)} />
        {data.people.length === 0 ? (
          <Empty>No contributors yet.</Empty>
        ) : (
          <div className="grid g2">
            {data.people.map((person) => (
              <div className="stack" key={person.userId} style={{ gap: 10 }}>
                <div className="between">
                  <Link to={`/people/${person.userId}`}>
                    <b>{person.fullName}</b>
                  </Link>
                  <span className="xs faint">
                    {data.weekDaysDone} of {data.weekDaysTotal} working days gone
                  </span>
                </div>
                {person.targets.map((target) => {
                  const result = pace(
                    target.actual,
                    target.target,
                    data.weekDaysDone,
                    data.weekDaysTotal,
                  );
                  return (
                    <div className="stack" style={{ gap: 4 }} key={target.metricKey}>
                      <div className="between xs">
                        <span className="muted">{target.label}</span>
                        <span className="row" style={{ gap: 10 }}>
                          <span className="mono muted">
                            {formatNumber(target.actual)}
                            {target.target === null ? '' : ` / ${formatNumber(target.target)}`}
                          </span>
                          <PaceDot level={result.level} word={result.word} />
                        </span>
                      </div>
                      <div className="bar">
                        <i
                          className={result.level === 'bad' ? 'behind' : ''}
                          style={{
                            width: `${Math.round((targetShare(target.actual, target.target) ?? 0) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid g2">
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

        <Card as="section">
          <CardHead title="Impressions" sub="Last 12 weeks" />
          <ImpressionsChart points={data.impressions} />
        </Card>
      </div>

      <div className="grid g2">
        <Card as="section">
          <CardHead
            title="ABM, one a week"
            sub={`${data.abm.filter((w) => !w.missed).length} of ${data.abm.length} weeks hit`}
          />
          <div className="stack" style={{ gap: 8 }}>
            {data.abm.slice(-6).reverse().map((week) => (
              <div className="between small" key={week.week}>
                <span className="mono xs faint">
                  {formatWeek(week.week).replace('Week of ', '')}
                </span>
                <span className="row">
                  <span>{week.account?.name ?? 'No account planned'}</span>
                  <Pill tone={week.missed ? 'bad' : 'good'}>
                    {week.missed ? 'Missed' : (week.account?.stage ?? 'Hit')}
                  </Pill>
                </span>
              </div>
            ))}
          </div>
          <LinkButton to="/abm" small>
            Open the tracker
          </LinkButton>
        </Card>

        <Card as="section">
          <CardHead title="Search activity" sub="Last four weeks" />
          {data.searchActivities.length === 0 ? (
            <Empty>Nothing logged yet.</Empty>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {data.searchActivities.slice(0, 8).map((row) => (
                <div className="stack" style={{ gap: 2 }} key={row.id}>
                  <div className="row">
                    <Pill tone="info">{row.kind}</Pill>
                    <b className="small">{row.description}</b>
                  </div>
                  <span className="xs faint">
                    {row.userName} · {formatWeek(row.week)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function shiftMonth(month: string, by: number): string {
  const date = new Date(`${monthStart(month)}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + by);
  return date.toISOString().slice(0, 7);
}
