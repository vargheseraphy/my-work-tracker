/** Holidays and leave (design/calendar.html). */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDays,
  daysInMonth,
  formatDayLong,
  formatMonth,
  isoDayOfWeek,
  monthStart,
  type CalendarDayDto,
  type DayKind,
  type Profile,
} from '@gtm/shared';
import { api, ApiProblem } from '../../api.js';
import { useUser } from '../../auth.jsx';
import { useToast } from '../../components/Toast.jsx';
import { Modal } from '../../components/Overlay.jsx';
import {
  Button,
  Card,
  CardHead,
  Empty,
  ErrorNote,
  Loading,
  PageHead,
  Pill,
} from '../../components/ui.jsx';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function CalendarScreen() {
  const user = useUser();
  const [month, setMonth] = useState(() => user.today.slice(0, 7));
  const [adding, setAdding] = useState<string | null>(null);

  const days = daysInMonth(month);
  const first = days[0]!;
  const last = days.at(-1)!;

  const { data, isPending } = useQuery({
    queryKey: ['calendar', month],
    queryFn: () => api.get<{ days: CalendarDayDto[] }>(`/admin/calendar?from=${first}&to=${last}`),
  });

  const { data: people } = useQuery({
    queryKey: ['people'],
    queryFn: () => api.get<{ people: Profile[] }>('/people'),
  });

  if (isPending) return <Loading what="Loading the calendar" />;

  const entries = data?.days ?? [];
  const leading = isoDayOfWeek(first) - 1;

  return (
    <>
      <PageHead
        eyebrow="Setup"
        title="Holidays and leave"
        actions={
          <div className="row">
            <Button small onClick={() => setMonth(shiftMonth(month, -1))}>
              Previous month
            </Button>
            <span className="small muted" style={{ minWidth: 130, textAlign: 'center' }}>
              {formatMonth(month)}
            </span>
            <Button small onClick={() => setMonth(shiftMonth(month, 1))}>
              Next month
            </Button>
          </div>
        }
      />

      <Card as="section">
        <CardHead
          title={formatMonth(month)}
          sub="A holiday is for everyone; leave is for one person"
        />
        <div className="cal">
          {DOW.map((name) => (
            <div className="dow" key={name}>
              {name}
            </div>
          ))}
          {Array.from({ length: leading }, (_, index) => (
            <div className="day out" key={`pad-${index}`} aria-hidden="true" />
          ))}
          {days.map((day) => {
            const onDay = entries.filter((entry) => entry.day === day);
            const weekend = isoDayOfWeek(day) > 5;
            return (
              <button
                type="button"
                key={day}
                className={`day${weekend ? ' we' : ''}`}
                onClick={() => setAdding(day)}
                aria-label={`${formatDayLong(day)}, add a holiday or leave`}
              >
                <span className="n">{day.slice(8)}</span>
                {onDay.map((entry) => (
                  <Pill key={entry.id} tone={entry.kind === 'holiday' ? 'info' : 'warn'}>
                    {entry.kind === 'holiday' ? entry.label : (entry.userName ?? 'Leave')}
                  </Pill>
                ))}
              </button>
            );
          })}
        </div>
      </Card>

      <Card as="section">
        <CardHead title="This month" sub={`${entries.length} entries`} />
        {entries.length === 0 ? (
          <Empty>Nothing marked for this month.</Empty>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {entries.map((entry) => (
              <Row key={entry.id} entry={entry} month={month} />
            ))}
          </div>
        )}
      </Card>

      {adding ? (
        <AddDay
          day={adding}
          month={month}
          people={(people?.people ?? []).filter((p) => p.active)}
          onClose={() => setAdding(null)}
        />
      ) : null}
    </>
  );
}

function Row({ entry, month }: { entry: CalendarDayDto; month: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const remove = useMutation({
    mutationFn: () => api.del(`/admin/calendar/${entry.id}`),
    onSuccess: () => {
      toast.show('Removed');
      void queryClient.invalidateQueries({ queryKey: ['calendar', month] });
    },
  });

  return (
    <div className="between small">
      <span className="row">
        <span className="mono xs faint" style={{ minWidth: 110 }}>
          {formatDayLong(entry.day)}
        </span>
        <Pill tone={entry.kind === 'holiday' ? 'info' : 'warn'}>{entry.kind}</Pill>
        <span>{entry.label}</span>
        {entry.userName ? <span className="muted">· {entry.userName}</span> : null}
      </span>
      <Button small tone="ghost" onClick={() => remove.mutate()} disabled={remove.isPending}>
        Remove
      </Button>
    </div>
  );
}

function AddDay({
  day,
  month,
  people,
  onClose,
}: {
  day: string;
  month: string;
  people: Profile[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<DayKind>('holiday');
  const [label, setLabel] = useState('');
  const [userId, setUserId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post('/admin/calendar', {
        day,
        kind,
        label,
        userId: kind === 'leave' ? userId : null,
      }),
    onSuccess: () => {
      toast.show(kind === 'holiday' ? 'Holiday added' : 'Leave added');
      void queryClient.invalidateQueries({ queryKey: ['calendar', month] });
      onClose();
    },
    onError: (problem) =>
      setError(problem instanceof ApiProblem ? problem.text : 'That could not be added'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={formatDayLong(day)}
      footer={
        <Button
          tone="primary"
          disabled={label.trim() === '' || (kind === 'leave' && userId === '') || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? 'Adding…' : 'Add it'}
        </Button>
      }
    >
      <div className="field">
        <label htmlFor="cal-kind">What is it?</label>
        <select
          id="cal-kind"
          className="select"
          value={kind}
          onChange={(event) => setKind(event.target.value as DayKind)}
        >
          <option value="holiday">Public holiday, for everyone</option>
          <option value="leave">Leave, for one person</option>
        </select>
      </div>
      {kind === 'leave' ? (
        <div className="field">
          <label htmlFor="cal-person">Who?</label>
          <select
            id="cal-person"
            className="select"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          >
            <option value="">Choose a person</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.fullName}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="cal-label">Label</label>
        <input
          id="cal-label"
          className="input"
          maxLength={80}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder={kind === 'holiday' ? 'National day' : 'Annual leave'}
        />
      </div>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <p className="xs faint">
        A day marked here stops counting as a working day, so it never shows as missing.
      </p>
    </Modal>
  );
}

function shiftMonth(month: string, by: number): string {
  const date = new Date(`${monthStart(month)}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + by);
  return date.toISOString().slice(0, 7);
}

export { addDays };
