/** Contributor home (design/home.html). */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  formatDayLong,
  formatDayShort,
  formatNumber,
  formatWeekRange,
  pace,
  targetShare,
  type HomeDto,
  type TaskDto,
} from '@gtm/shared';
import { api } from '../../api.js';
import { useUser } from '../../auth.jsx';
import {
  Banner,
  Card,
  CardHead,
  Empty,
  Loading,
  LinkButton,
  PageHead,
  Pill,
  Segmented,
  StatCard,
} from '../../components/ui.jsx';
import { StreakCard } from './StreakCard.jsx';

const STATUS_WORD: Record<string, string> = {
  missing: 'Not started',
  draft: 'In progress',
  submitted: 'Submitted',
  late: 'Submitted late',
  unlocked: 'Unlocked for editing',
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

type Filter = 'all' | 'today' | 'overdue';

export function Home() {
  const user = useUser();
  const [filter, setFilter] = useState<Filter>('all');

  const { data, isPending, error } = useQuery({
    queryKey: ['home'],
    queryFn: () => api.get<HomeDto>('/home'),
  });

  if (isPending) return <Loading what="Loading your day" />;
  if (error || !data) return <Empty>Your home screen could not be loaded. Refresh the page.</Empty>;

  const firstMissing = data.backfillDays[0] ?? data.missingDays[0];
  const tasks = data.openTasks.filter((task) =>
    filter === 'all' ? true : filter === 'today' ? task.isDueToday : task.isOverdue,
  );
  const overdueCount = data.openTasks.filter((t) => t.isOverdue).length;
  const todayCount = data.openTasks.filter((t) => t.isDueToday).length;

  const dayLocked = data.backfillDays.length > 0;

  return (
    <>
      <PageHead eyebrow={formatDayLong(data.today)} title={`${greeting()}, ${user.fullName}`} />

      {firstMissing ? (
        <Banner
          tone="bad"
          role="alert"
          title={`${formatDayLong(firstMissing)} is missing`}
          body="Fill it in first. Today's log stays locked until it is submitted, and it will be marked late."
          action={
            <LinkButton to={`/daily/${firstMissing}`}>
              Fill {formatDayShort(firstMissing)}
            </LinkButton>
          }
        />
      ) : null}

      <div className="grid g3">
        <StatCard
          kicker="Today's log"
          stat={
            data.todayIsWorkingDay
              ? (STATUS_WORD[data.todayStatus] ?? 'Not started')
              : 'Not a working day'
          }
          note={
            !data.todayIsWorkingDay
              ? 'Nothing is due from you today.'
              : dayLocked
                ? 'Locked until the missing day is submitted'
                : 'Due 7pm, in your own time zone'
          }
          action={
            <LinkButton to="/daily" tone={dayLocked || !data.todayIsWorkingDay ? 'default' : 'primary'}>
              Open daily log
            </LinkButton>
          }
        />
        <StreakCard streak={data.streak} />
        <StatCard
          kicker="Weekly log"
          stat={
            data.weeklyStatus === 'missing'
              ? data.weeklyIsOpen
                ? 'Open now'
                : 'Opens Friday'
              : (STATUS_WORD[data.weeklyStatus] ?? 'Open now')
          }
          note={`Due Monday 12pm · ${formatWeekRange(data.weekMonday)}`}
          action={
            <LinkButton to="/weekly">
              {data.weeklyIsOpen ? 'Open weekly log' : 'Preview weekly log'}
            </LinkButton>
          }
        />
      </div>

      <div className="grid g2">
        <Card as="section">
          <CardHead title="This week against target" sub={formatWeekRange(data.weekMonday)} />
          <div className="stack" style={{ gap: 14 }}>
            {data.targets.length === 0 ? (
              <Empty>No targets are set for you yet.</Empty>
            ) : (
              data.targets.map((target) => {
                const result = pace(
                  target.actual,
                  target.target,
                  data.weekDaysDone,
                  data.weekDaysTotal,
                );
                const share = targetShare(target.actual, target.target) ?? 0;
                return (
                  <div className="stack" style={{ gap: 6 }} key={target.metricKey}>
                    <div className="between small">
                      <span>{target.label}</span>
                      <span className="mono muted">
                        {formatNumber(target.actual)}
                        {target.target === null ? '' : ` / ${formatNumber(target.target)}`}
                        {' · '}
                        {result.word}
                      </span>
                    </div>
                    <div className="bar">
                      <i
                        className={result.level === 'good' || result.level === 'none' ? '' : 'behind'}
                        style={{ width: `${Math.round(share * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <p className="xs faint" style={{ marginTop: 16 }}>
            Targets are set by Raphy. Black means on pace for the week so far; grey-blue means
            behind.
          </p>
        </Card>

        <Card as="section">
          <CardHead
            title="My open tasks"
            actions={
              <Segmented<Filter>
                label="Filter tasks"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: `All ${data.openTasks.length}` },
                  { value: 'today', label: `Due today ${todayCount}` },
                  { value: 'overdue', label: `Overdue ${overdueCount}` },
                ]}
              />
            }
          />
          <div className="stack">
            {tasks.length === 0 ? (
              <p className="small muted">Nothing here.</p>
            ) : (
              tasks.map((task) => <TaskRow key={task.id} task={task} />)
            )}
          </div>
          <Link
            className="btn btn-ghost btn-sm"
            to="/tasks"
            style={{ marginTop: 8, alignSelf: 'flex-start' }}
          >
            All my tasks
          </Link>
        </Card>
      </div>

      {data.abmThisWeek ? (
        <Card tight className="between">
          <div className="stack" style={{ gap: 4 }}>
            <span className="kicker">This week&apos;s ABM account</span>
            <b style={{ fontSize: 16 }}>
              {data.abmThisWeek.name} · {data.abmThisWeek.vertical} · {data.abmThisWeek.region}
            </b>
          </div>
          <div className="row wrap">
            <Pill tone={data.abmThisWeek.isLive ? 'good' : 'warn'}>{data.abmThisWeek.stage}</Pill>
            <LinkButton to="/abm" small>
              Open tracker
            </LinkButton>
          </div>
        </Card>
      ) : null}
    </>
  );
}

const STATUS_TONE: Record<string, 'good' | 'bad' | 'info' | 'plain'> = {
  Done: 'good',
  'In progress': 'info',
  Blocked: 'bad',
  'Not started': 'plain',
  Cancelled: 'plain',
};

function TaskRow({ task }: { task: TaskDto }) {
  const due = task.isOverdue
    ? `Overdue · was due ${formatDayShort(task.dueDate)}`
    : task.isDueToday
      ? 'Due today'
      : `Due ${formatDayShort(task.dueDate)}`;

  return (
    <Link
      to={`/tasks/${task.id}`}
      className="card tight"
      style={{
        textDecoration: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        background: 'var(--surface-2)',
      }}
    >
      <div className="between">
        <b className="small">{task.title}</b>
        <Pill tone={STATUS_TONE[task.status] ?? 'plain'}>{task.status}</Pill>
      </div>
      <div className="row xs muted wrap">
        <span style={task.isOverdue ? { color: 'var(--bad)' } : undefined}>{due}</span>
        <span>Priority {task.priority}</span>
      </div>
    </Link>
  );
}
