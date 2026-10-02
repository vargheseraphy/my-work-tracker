/** My tasks (design/my-tasks.html), with the detail drawer and its history. */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatDayShort,
  type TaskDetailDto,
  type TaskDto,
  type TaskStatus,
} from '@gtm/shared';
import { api, ApiProblem } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { Drawer } from '../../components/Overlay.jsx';
import { DataTable, type Column } from '../../components/data.jsx';
import {
  Button,
  Card,
  Empty,
  ErrorNote,
  Loading,
  PageHead,
  Pill,
  Segmented,
  type Tone,
} from '../../components/ui.jsx';

export const STATUS_TONE: Record<TaskStatus, Tone> = {
  'Not started': 'plain',
  'In progress': 'info',
  Blocked: 'bad',
  Done: 'good',
  Cancelled: 'plain',
};

const PICKABLE: TaskStatus[] = ['Not started', 'In progress', 'Blocked', 'Done'];

type Filter = 'open' | 'all' | 'overdue' | 'done';

export function MyTasks() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('open');

  const { data, isPending } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.get<{ tasks: TaskDto[] }>('/tasks'),
  });

  if (isPending) return <Loading what="Loading your tasks" />;

  const all = data?.tasks ?? [];
  const rows = all.filter((task) => {
    if (filter === 'all') return true;
    if (filter === 'overdue') return task.isOverdue;
    if (filter === 'done') return task.status === 'Done';
    return task.status !== 'Done' && task.status !== 'Cancelled';
  });

  const columns: Column<TaskDto>[] = [
    {
      key: 'title',
      head: 'Task',
      render: (task) => (
        <div className="stack" style={{ gap: 2 }}>
          <b className="small">{task.title}</b>
          <span className="xs faint">Priority {task.priority}</span>
        </div>
      ),
    },
    {
      key: 'due',
      head: 'Due',
      render: (task) => (
        <span className="small" style={task.isOverdue ? { color: 'var(--bad)' } : undefined}>
          {task.isOverdue
            ? `Overdue · ${formatDayShort(task.dueDate)}`
            : task.isDueToday
              ? 'Due today'
              : formatDayShort(task.dueDate)}
        </span>
      ),
    },
    {
      key: 'status',
      head: 'Status',
      render: (task) => <Pill tone={STATUS_TONE[task.status]}>{task.status}</Pill>,
    },
  ];

  return (
    <>
      <PageHead
        eyebrow="Backlog"
        title="My tasks"
        actions={
          <Segmented<Filter>
            label="Filter tasks"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'open', label: 'Open' },
              { value: 'overdue', label: 'Overdue' },
              { value: 'done', label: 'Done' },
              { value: 'all', label: 'All' },
            ]}
          />
        }
      />

      <Card as="section">
        <DataTable
          caption="My tasks"
          columns={columns}
          rows={rows}
          rowKey={(task) => task.id}
          empty="Nothing here."
          onRowClick={(task) => navigate(`/tasks/${task.id}`)}
        />
      </Card>

      {id ? <TaskDrawer id={id} onClose={() => navigate('/tasks')} /> : null}
    </>
  );
}

export function TaskDrawer({
  id,
  onClose,
  canCancel = false,
}: {
  id: string;
  onClose: () => void;
  canCancel?: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const [note, setNote] = useState('');
  const [proof, setProof] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ['task', id],
    queryFn: () => api.get<{ task: TaskDetailDto }>(`/tasks/${id}`),
  });

  const update = useMutation({
    mutationFn: () =>
      api.post(`/tasks/${id}/status`, {
        status,
        note: note.trim() === '' ? null : note.trim(),
        proofUrl: proof.trim() === '' ? null : proof.trim(),
      }),
    onSuccess: () => {
      setStatus('');
      setNote('');
      setProof('');
      setError(null);
      toast.show('Task updated');
      void queryClient.invalidateQueries({ queryKey: ['task', id] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['home'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'tasks'] });
    },
    onError: (problem) => {
      setError(problem instanceof ApiProblem ? problem.text : 'That could not be saved');
    },
  });

  const cancel = useMutation({
    mutationFn: () => api.patch(`/tasks/${id}`, { cancel: true }),
    onSuccess: () => {
      toast.show('Task cancelled');
      void queryClient.invalidateQueries({ queryKey: ['task', id] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'tasks'] });
    },
  });

  const task = data?.task;

  return (
    <Drawer open onClose={onClose} title={task?.title ?? 'Task'}>
      {isPending || !task ? (
        <Loading />
      ) : (
        <>
          <div className="row wrap">
            <Pill tone={STATUS_TONE[task.status]}>{task.status}</Pill>
            <Pill tone={task.isOverdue ? 'bad' : 'plain'}>
              {task.isOverdue ? 'Overdue · ' : 'Due '}
              {formatDayShort(task.dueDate)}
            </Pill>
            <Pill>Priority {task.priority}</Pill>
            <Pill>{task.assigneeName}</Pill>
          </div>

          {task.description ? <p className="small muted">{task.description}</p> : null}

          {task.proofUrl ? (
            <p className="small">
              Proof:{' '}
              <a href={task.proofUrl} target="_blank" rel="noopener noreferrer">
                {task.proofUrl}
              </a>
            </p>
          ) : null}

          {task.status !== 'Done' && task.status !== 'Cancelled' ? (
            <div className="stack">
              <div className="field">
                <label htmlFor="task-status">Change the status</label>
                <select
                  id="task-status"
                  className="select"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as TaskStatus | '')}
                >
                  <option value="">Choose</option>
                  {PICKABLE.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </div>

              {status === 'Blocked' ? (
                <div className="field">
                  <label htmlFor="task-note">What is blocking you?</label>
                  <textarea
                    id="task-note"
                    className="textarea"
                    rows={2}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
              ) : null}

              {status === 'Done' ? (
                <div className="field">
                  <label htmlFor="task-proof">Link to the proof</label>
                  <input
                    id="task-proof"
                    className="input"
                    type="url"
                    placeholder="https://"
                    value={proof}
                    onChange={(event) => setProof(event.target.value)}
                  />
                  <span className="hint">A link or an attached file is needed to finish.</span>
                </div>
              ) : null}

              {status !== '' && status !== 'Blocked' && status !== 'Done' ? (
                <div className="field">
                  <label htmlFor="task-note-optional">Add a note</label>
                  <input
                    id="task-note-optional"
                    className="input"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
              ) : null}

              {error ? <ErrorNote>{error}</ErrorNote> : null}

              <Button
                tone="primary"
                disabled={status === '' || update.isPending}
                onClick={() => update.mutate()}
              >
                {update.isPending ? 'Saving…' : 'Save the status'}
              </Button>

              {canCancel ? (
                <Button tone="dashed" onClick={() => cancel.mutate()}>
                  Cancel this task
                </Button>
              ) : null}
            </div>
          ) : null}

          <hr className="divider" />
          <h3>History</h3>
          {task.updates.length === 0 ? (
            <Empty>No changes yet.</Empty>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {task.updates.map((row) => (
                <div className="card tight stack" style={{ gap: 4 }} key={row.id}>
                  <div className="between">
                    <Pill tone={STATUS_TONE[row.status]}>{row.status}</Pill>
                    <span className="mono xs faint">{formatDayShort(row.localDate)}</span>
                  </div>
                  {row.note ? <span className="small muted">{row.note}</span> : null}
                  {row.proofUrl ? (
                    <a
                      className="xs"
                      href={row.proofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {row.proofUrl}
                    </a>
                  ) : null}
                  <span className="xs faint">{row.byName}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}
