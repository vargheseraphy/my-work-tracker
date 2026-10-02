import type { DueTaskDto, TaskDetailDto, TaskDto, TaskUpdateDto } from '@gtm/shared';
import { many, one, type PoolClient } from '../db.js';
import { notFound } from '../errors.js';
import { readAttachments } from '../entries/service.js';

const TASK_COLUMNS = `
  t.id, t.title, t.description, t.assignee_id as "assigneeId", p.full_name as "assigneeName",
  t.due_date as "dueDate", t.priority, t.status, t.status_note as "statusNote",
  t.proof_url as "proofUrl", t.completed_at as "completedAt", t.created_at as "createdAt",
  (t.status not in ('Done', 'Cancelled') and t.due_date < local_today(t.assignee_id)) as "isOverdue",
  (t.status not in ('Done', 'Cancelled') and t.due_date = local_today(t.assignee_id)) as "isDueToday"`;

interface RawTask extends Omit<TaskDto, 'completedAt' | 'createdAt'> {
  completedAt: Date | null;
  createdAt: Date;
}

function toTask(row: RawTask): TaskDto {
  return {
    ...row,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listTasks(
  client: PoolClient,
  filters: { status?: string; assigneeId?: string; openOnly?: boolean } = {},
): Promise<TaskDto[]> {
  const rows = await many<RawTask>(
    client,
    `select ${TASK_COLUMNS}
       from tasks t join profiles p on p.id = t.assignee_id
      where ($1::task_status is null or t.status = $1)
        and ($2::uuid is null or t.assignee_id = $2)
        and ($3::boolean is not true or t.status not in ('Done', 'Cancelled'))
      order by
        case t.status when 'Blocked' then 0 when 'In progress' then 1 when 'Not started' then 2 else 3 end,
        t.due_date, t.priority`,
    [filters.status ?? null, filters.assigneeId ?? null, filters.openOnly ?? false],
  );
  return rows.map(toTask);
}

export async function readTask(client: PoolClient, taskId: string): Promise<TaskDetailDto> {
  const row = await one<RawTask>(
    client,
    `select ${TASK_COLUMNS} from tasks t join profiles p on p.id = t.assignee_id where t.id = $1`,
    [taskId],
  );
  if (!row) throw notFound();

  const updates = await many<Omit<TaskUpdateDto, 'createdAt'> & { createdAt: Date }>(
    client,
    `select tu.id, tu.status, tu.note, tu.proof_url as "proofUrl",
            tu.local_date as "localDate", tu.created_at as "createdAt", p.full_name as "byName"
       from task_updates tu join profiles p on p.id = tu.user_id
      where tu.task_id = $1 order by tu.created_at desc`,
    [taskId],
  );

  return {
    ...toTask(row),
    updates: updates.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
    attachments: await readAttachments(client, { taskId }),
  };
}

/** Open tasks due on or before a given day, and whether each already has an update for it (DAY-06). */
export async function readDueTasks(
  client: PoolClient,
  userId: string,
  day: string,
): Promise<DueTaskDto[]> {
  return many<DueTaskDto>(
    client,
    `select t.id, t.title, t.due_date as "dueDate", t.status, t.priority,
            exists (select 1 from task_updates tu
                     where tu.task_id = t.id and tu.local_date >= $2::date) as "hasUpdateForDay"
       from tasks t
      where t.assignee_id = $1 and t.status not in ('Done', 'Cancelled') and t.due_date <= $2::date
      order by t.due_date, t.priority`,
    [userId, day],
  );
}

/** Status change through update_task(), which holds the rules (TSK-02, TSK-03). */
export async function updateTaskStatus(
  client: PoolClient,
  taskId: string,
  status: string,
  note: string | null,
  proofUrl: string | null,
): Promise<TaskDetailDto> {
  await client.query('select update_task($1, $2, $3, $4)', [taskId, status, note, proofUrl]);
  return readTask(client, taskId);
}

export async function createTask(
  client: PoolClient,
  input: {
    title: string;
    description: string | null;
    assigneeId: string;
    dueDate: string;
    priority: string;
  },
  createdBy: string,
): Promise<TaskDetailDto> {
  const row = await one<{ id: string }>(
    client,
    `insert into tasks (title, description, assignee_id, due_date, priority, created_by)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [input.title, input.description, input.assigneeId, input.dueDate, input.priority, createdBy],
  );
  return readTask(client, row!.id);
}

export async function patchTask(
  client: PoolClient,
  taskId: string,
  input: {
    title?: string;
    description?: string | null;
    assigneeId?: string;
    dueDate?: string;
    priority?: string;
    cancel?: true;
  },
): Promise<TaskDetailDto> {
  if (input.cancel) {
    // Cancelling is a status change, so it has to go through update_task().
    await client.query('select update_task($1, $2, $3, null)', [
      taskId,
      'Cancelled',
      'Cancelled by an admin',
    ]);
  }

  const sets: string[] = [];
  const values: unknown[] = [taskId];
  for (const [key, column] of [
    ['title', 'title'],
    ['description', 'description'],
    ['assigneeId', 'assignee_id'],
    ['dueDate', 'due_date'],
    ['priority', 'priority'],
  ] as const) {
    const value = input[key];
    if (value !== undefined) {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    }
  }

  if (sets.length > 0) {
    const result = await client.query(
      `update tasks set ${sets.join(', ')} where id = $1`,
      values,
    );
    if (result.rowCount === 0) throw notFound();
  }

  return readTask(client, taskId);
}
