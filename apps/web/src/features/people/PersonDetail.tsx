/** One person's recent days with their proof, and Unlock with a reason (design/person.html). */

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ENTRY_STATUS_LABEL,
  formatDayLong,
  formatDayShort,
  formatNumber,
  formatWeekRange,
  pace,
  type PersonDetailDto,
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
  PaceDot,
  PageHead,
  Pill,
} from '../../components/ui.jsx';

const STATUS_TONE: Record<string, 'good' | 'warn' | 'bad' | 'info' | 'plain'> = {
  submitted: 'good',
  late: 'warn',
  missing: 'bad',
  unlocked: 'info',
  draft: 'plain',
};

export function PersonDetail() {
  const { id } = useParams();
  const user = useUser();
  const [unlocking, setUnlocking] = useState<{ day: string; type: 'daily' | 'weekly' } | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ['person', id],
    queryFn: () => api.get<PersonDetailDto>(`/admin/people/${id!}?days=10`),
    enabled: Boolean(id),
  });

  if (isPending) return <Loading what="Loading the person" />;
  if (!data) return <Empty>That person could not be loaded.</Empty>;

  const label = (key: string) => data.fields.find((f) => f.key === key)?.label ?? key;

  return (
    <>
      <PageHead
        eyebrow={`${data.profile.role} · ${data.profile.timezone}`}
        title={data.profile.fullName}
      />

      <Card as="section">
        <CardHead title="This week against target" sub={formatWeekRange(data.today)} />
        {data.targets.length === 0 ? (
          <Empty>No targets are set for this person.</Empty>
        ) : (
          <div className="grid g3">
            {data.targets.map((target) => {
              const result = pace(target.actual, target.target, 5, 5);
              return (
                <div className="stack" style={{ gap: 4 }} key={target.metricKey}>
                  <span className="kicker">{target.label}</span>
                  <span className="stat">{formatNumber(target.actual)}</span>
                  <div className="between">
                    <span className="xs faint">
                      {target.target === null ? 'No target' : `Target ${formatNumber(target.target)}`}
                    </span>
                    <PaceDot level={result.level} word={result.word} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card as="section">
        <CardHead title="The last 10 working days" sub="Newest first" />
        <div className="stack">
          {data.days.map((day) => (
            <div className="card tight stack" key={day.day} style={{ gap: 10 }}>
              <div className="between">
                <div className="row">
                  <b className="small">{formatDayLong(day.day)}</b>
                  <Pill tone={STATUS_TONE[day.status] ?? 'plain'}>
                    {ENTRY_STATUS_LABEL[day.status as keyof typeof ENTRY_STATUS_LABEL] ?? day.status}
                  </Pill>
                </div>
                {user.role === 'admin' ? (
                  <Button
                    small
                    onClick={() => setUnlocking({ day: day.day, type: 'daily' })}
                  >
                    {day.status === 'missing' ? 'Open this day' : 'Unlock'}
                  </Button>
                ) : null}
              </div>

              {day.values.length === 0 ? (
                <span className="xs faint">Nothing logged.</span>
              ) : (
                <div className="row wrap" style={{ gap: 14 }}>
                  {day.values
                    .filter((value) => value.numValue !== null)
                    .map((value) => (
                      <span className="xs" key={value.metricKey}>
                        <span className="muted">{label(value.metricKey)}: </span>
                        <span className="mono">{formatNumber(value.numValue)}</span>
                      </span>
                    ))}
                </div>
              )}

              {day.attachments.length > 0 ? (
                <div className="row wrap" style={{ gap: 8 }}>
                  {day.attachments.map((attachment) => (
                    <a
                      key={attachment.id}
                      className="pill"
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {label(attachment.metricKey ?? '')}: {attachment.fileName}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Card>

      <Card as="section">
        <CardHead title="Recent weekly logs" />
        {data.weeklyEntries.length === 0 ? (
          <Empty>No weekly logs yet.</Empty>
        ) : (
          <div className="stack">
            {data.weeklyEntries.map((entry) => (
              <div className="between" key={entry.id}>
                <span className="small">{formatWeekRange(entry.periodStart)}</span>
                <span className="row">
                  <Pill tone={STATUS_TONE[entry.status] ?? 'plain'}>
                    {ENTRY_STATUS_LABEL[entry.status]}
                  </Pill>
                  {user.role === 'admin' ? (
                    <Button
                      small
                      onClick={() => setUnlocking({ day: entry.periodStart, type: 'weekly' })}
                    >
                      Unlock
                    </Button>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card as="section">
        <CardHead title="Backlog" sub={`${data.tasks.length} tasks`} />
        {data.tasks.length === 0 ? (
          <Empty>No tasks.</Empty>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {data.tasks.map((task) => (
              <div className="between small" key={task.id}>
                <span>{task.title}</span>
                <span className="row">
                  <span className="xs faint">{formatDayShort(task.dueDate)}</span>
                  <Pill tone={task.isOverdue ? 'bad' : 'plain'}>{task.status}</Pill>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {unlocking && id ? (
        <UnlockModal
          userId={id}
          day={unlocking.day}
          type={unlocking.type}
          onClose={() => setUnlocking(null)}
        />
      ) : null}
    </>
  );
}

function UnlockModal({
  userId,
  day,
  type,
  onClose,
}: {
  userId: string;
  day: string;
  type: 'daily' | 'weekly';
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  const unlock = useMutation({
    mutationFn: () => api.post('/admin/unlock', { userId, type, period: day, reason }),
    onSuccess: () => {
      toast.show('Unlocked, and the person has been told');
      void queryClient.invalidateQueries({ queryKey: ['person', userId] });
      onClose();
    },
    onError: (problem) =>
      setError(problem instanceof ApiProblem ? problem.text : 'That could not be unlocked'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Unlock ${formatDayLong(day)}`}
      footer={
        <Button
          tone="primary"
          disabled={reason.trim() === '' || unlock.isPending}
          onClick={() => unlock.mutate()}
        >
          {unlock.isPending ? 'Unlocking…' : 'Unlock the entry'}
        </Button>
      }
    >
      <p className="small muted">
        The person can edit and submit again. The old values stay in the audit log, and the entry
        stays marked late if it already was.
      </p>
      <div className="field">
        <label htmlFor="unlock-reason">Reason</label>
        <textarea
          id="unlock-reason"
          className="textarea"
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <span className="hint">They will see this in the notification.</span>
      </div>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </Modal>
  );
}
