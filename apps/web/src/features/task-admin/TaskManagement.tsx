/** Task management for an admin (design/task-management.html). */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatDayShort,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Profile,
  type TaskDto,
  type TaskPriority,
  type TaskStatus,
} from '@gtm/shared';
import { api, ApiProblem } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { Modal } from '../../components/Overlay.jsx';
import { DataTable, type Column } from '../../components/data.jsx';
import {
  Button,
  Card,
  ErrorNote,
  Loading,
  PageHead,
  Pill,
  Segmented,
} from '../../components/ui.jsx';
import { STATUS_TONE, TaskDrawer } from '../tasks/MyTasks.jsx';

type Filter = 'open' | 'overdue' | 'all';

export function TaskManagement() {
  const [filter, setFilter] = useState<Filter>('open');
  const [owner, setOwner] = useState<string>('all');
  const [creating, setCreating] = useState(false);
  const [openTask, setOpenTask] = useState<string | null>(null);

  const { data: people } = useQuery({
    queryKey: ['people'],
    queryFn: () => api.get<{ people: Profile[] }>('/people'),
  });

  const { data, isPending } = useQuery({
    queryKey: ['admin', 'tasks', owner],
    queryFn: () => api.get<{ tasks: TaskDto[] }>(`/tasks?owner=${owner}`),
  });

  if (isPending) return <Loading what="Loading the backlog" />;

  const all = data?.tasks ?? [];
  const rows = all.filter((task) => {
    if (filter === 'all') return true;
    if (filter === 'overdue') return task.isOverdue;
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
    { key: 'owner', head: 'Assignee', render: (task) => <span className="small">{task.assigneeName}</span> },
    {
      key: 'due',
      head: 'Due',
      render: (task) => (
        <span className="small" style={task.isOverdue ? { color: 'var(--bad)' } : undefined}>
          {formatDayShort(task.dueDate)}
          {task.isOverdue ? ' · overdue' : ''}
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
        title="Task management"
        actions={
          <div className="row wrap">
            <Segmented<Filter>
              label="Filter tasks"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'open', label: 'Open' },
                { value: 'overdue', label: 'Overdue' },
                { value: 'all', label: 'All' },
              ]}
            />
            <label className="sr-only" htmlFor="owner-filter">
              Assignee
            </label>
            <select
              id="owner-filter"
              className="select"
              style={{ width: 170 }}
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
            >
              <option value="all">Everyone</option>
              {(people?.people ?? [])
                .filter((p) => p.role === 'contributor')
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName}
                  </option>
                ))}
            </select>
            <Button tone="primary" onClick={() => setCreating(true)}>
              New task
            </Button>
          </div>
        }
      />

      <Card as="section">
        <DataTable
          caption="Backlog tasks"
          columns={columns}
          rows={rows}
          rowKey={(task) => task.id}
          empty="Nothing in the backlog."
          onRowClick={(task) => setOpenTask(task.id)}
        />
      </Card>

      {creating ? (
        <NewTask people={people?.people ?? []} onClose={() => setCreating(false)} />
      ) : null}

      {openTask ? (
        <TaskDrawer id={openTask} canCancel onClose={() => setOpenTask(null)} />
      ) : null}
    </>
  );
}

function NewTask({ people, onClose }: { people: Profile[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('Medium');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post('/tasks', {
        title,
        description: description.trim() === '' ? null : description,
        assigneeId,
        dueDate,
        priority,
      }),
    onSuccess: () => {
      toast.show('Task created, and the assignee has been told');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'tasks'] });
      onClose();
    },
    onError: (problem) =>
      setError(problem instanceof ApiProblem ? problem.text : 'That task could not be created'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="New task"
      footer={
        <Button
          tone="primary"
          disabled={title.trim() === '' || assigneeId === '' || dueDate === '' || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? 'Creating…' : 'Create the task'}
        </Button>
      }
    >
      <div className="field">
        <label htmlFor="task-title">Title</label>
        <input
          id="task-title"
          className="input"
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="task-desc">Details</label>
        <textarea
          id="task-desc"
          className="textarea"
          rows={3}
          maxLength={4000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="task-assignee">Assignee</label>
        <select
          id="task-assignee"
          className="select"
          value={assigneeId}
          onChange={(event) => setAssigneeId(event.target.value)}
        >
          <option value="">Choose a person</option>
          {people
            .filter((p) => p.active && p.role !== 'viewer')
            .map((person) => (
              <option key={person.id} value={person.id}>
                {person.fullName}
              </option>
            ))}
        </select>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="task-due">Due date</label>
          <input
            id="task-due"
            className="input"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="task-priority">Priority</label>
          <select
            id="task-priority"
            className="select"
            value={priority}
            onChange={(event) => setPriority(event.target.value as TaskPriority)}
          >
            {TASK_PRIORITIES.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
      </div>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <p className="xs faint">
        Statuses are {TASK_STATUSES.join(', ')}. Only an admin can cancel a task.
      </p>
    </Modal>
  );
}

export type { TaskStatus };
