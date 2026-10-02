/** The weekly report (design/weekly-report.html), printable to A4, with the CSV export. */

import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  addDays,
  formatGrowth,
  formatNumber,
  formatWeek,
  formatWeekRange,
  growth,
  pace,
  weekMonday,
  type ReportDto,
} from '@gtm/shared';
import { api } from '../../api.js';
import { useUser } from '../../auth.jsx';
import {
  Button,
  Card,
  CardHead,
  Empty,
  Loading,
  PaceDot,
  PageHead,
  Pill,
  Scrollable,
} from '../../components/ui.jsx';

export function WeeklyReport() {
  const { monday } = useParams();
  const navigate = useNavigate();
  const user = useUser();
  const week = monday ?? addDays(weekMonday(user.today), -7);

  const { data, isPending } = useQuery({
    queryKey: ['report', week],
    queryFn: () => api.get<{ report: ReportDto }>(`/admin/report?monday=${week}`),
  });

  if (isPending) return <Loading what="Building the report" />;
  const report = data?.report;
  if (!report) return <Empty>The report could not be built.</Empty>;

  const compare = (current: number, previous: number | undefined) =>
    previous === undefined ? '' : formatGrowth(growth(current, previous));

  return (
    <>
      <PageHead
        eyebrow={`Week of ${formatWeekRange(report.monday)}`}
        title="GTM weekly report"
        actions={
          <div className="row no-print">
            <Button small onClick={() => navigate(`/report/${addDays(week, -7)}`)}>
              Previous week
            </Button>
            <Button small onClick={() => navigate(`/report/${addDays(week, 7)}`)}>
              Next week
            </Button>
            <Button small onClick={() => window.print()}>
              Print
            </Button>
            <a className="btn btn-sm" href={`/api/admin/export.csv?month=${week.slice(0, 7)}`}>
              Download the month as CSV
            </a>
          </div>
        }
      />

      <Card as="section">
        <CardHead
          title="Sign-off"
          sub={`${report.compliance.submitted + report.compliance.late} of ${report.compliance.expected} days`}
        />
        <div className="grid g4">
          <Stat label="On time" value={report.compliance.submitted} />
          <Stat label="Late" value={report.compliance.late} />
          <Stat label="Missing" value={report.compliance.missing} />
          <Stat
            label="Rate"
            value={
              report.compliance.expected === 0
                ? 0
                : Math.round(
                    ((report.compliance.submitted + report.compliance.late) /
                      report.compliance.expected) *
                      100,
                  )
            }
            suffix="%"
          />
        </div>
      </Card>

      <Card as="section">
        <CardHead title="The week in numbers" sub="Compared with the week before" />
        <Scrollable label="Weekly totals">
          <table className="table">
            <caption className="sr-only">Weekly totals</caption>
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col" className="num">
                  This week
                </th>
                <th scope="col" className="num">
                  Change
                </th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Accounts added', 'accountsAdded'],
                  ['Emails sent', 'emails'],
                  ['Replies', 'replies'],
                  ['Posts', 'posts'],
                  ['Calls made', 'calls'],
                  ['Meetings booked', 'meetings'],
                  ['Impressions', 'impressions'],
                ] as const
              ).map(([label, key]) => (
                <tr key={key}>
                  <td>{label}</td>
                  <td className="num">{formatNumber(report.totals[key])}</td>
                  <td className="num">
                    {compare(report.totals[key], report.previousTotals?.[key])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scrollable>
      </Card>

      <Card as="section">
        <CardHead title="By person" />
        <div className="stack">
          {report.people.map((person) => (
            <div className="card tight stack" key={person.userId} style={{ gap: 10 }}>
              <div className="between">
                <b>{person.fullName}</b>
                <span className="row">
                  <Pill tone={person.late > 0 ? 'warn' : 'good'}>
                    {person.daysSubmitted} of {person.daysExpected} days
                  </Pill>
                  {person.late > 0 ? <Pill tone="warn">{person.late} late</Pill> : null}
                </span>
              </div>

              <div className="row wrap" style={{ gap: 18 }}>
                {person.targets.map((target) => {
                  const result = pace(target.actual, target.target, 5, 5);
                  return (
                    <span className="row xs" key={target.metricKey} style={{ gap: 6 }}>
                      <span className="muted">{target.label}:</span>
                      <span className="mono">
                        {formatNumber(target.actual)}
                        {target.target === null ? '' : ` / ${formatNumber(target.target)}`}
                      </span>
                      <PaceDot level={result.level} word={result.word} />
                    </span>
                  );
                })}
              </div>

              {person.reflections ? (
                <div className="stack xs muted" style={{ gap: 4 }}>
                  {person.reflections.worked ? (
                    <span>
                      <b>Worked: </b>
                      {person.reflections.worked}
                    </span>
                  ) : null}
                  {person.reflections.notWorked ? (
                    <span>
                      <b>Did not: </b>
                      {person.reflections.notWorked}
                    </span>
                  ) : null}
                  {person.reflections.focus ? (
                    <span>
                      <b>Next: </b>
                      {person.reflections.focus}
                    </span>
                  ) : null}
                </div>
              ) : (
                <span className="xs faint">No weekly log submitted for this week.</span>
              )}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid g2">
        <Card as="section">
          <CardHead title="ABM" sub="One account live a week" />
          <div className="stack" style={{ gap: 8 }}>
            {report.abm.map((week) => (
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
        </Card>

        <Card as="section">
          <CardHead title="Backlog and search" />
          <div className="grid g3">
            <Stat label="Open" value={report.tasks.open} />
            <Stat label="Overdue" value={report.tasks.overdue} />
            <Stat label="Done this week" value={report.tasks.doneThisWeek} />
          </div>
          <hr className="divider" style={{ margin: '16px 0' }} />
          {report.searchActivities.length === 0 ? (
            <p className="small muted">No search activity logged this week.</p>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              {report.searchActivities.map((row) => (
                <div className="row xs" key={row.id}>
                  <Pill tone="info">{row.kind}</Pill>
                  <span>{row.description}</span>
                  <span className="faint">{row.userName}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="stack" style={{ gap: 2 }}>
      <span className="kicker">{label}</span>
      <span className="stat">
        {formatNumber(value)}
        {suffix ?? ''}
      </span>
    </div>
  );
}
