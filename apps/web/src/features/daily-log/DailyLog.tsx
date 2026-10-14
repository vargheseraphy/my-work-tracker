/** The daily log (design/daily-log.html). Every rule is checked again by the server on submit. */

import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkDaily,
  dailyProgress,
  formatDayLong,
  formatDayShort,
  type EntryScreenDto,
  type HomeDto,
  type MetricDefinition,
  type SubmitResult,
  type TaskStatus,
} from '@gtm/shared';
import { api, ApiProblem } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { DayTabs, type DayTab } from '../../components/data.jsx';
import {
  LinkField,
  NoteField,
  NumberField,
  ProgressAside,
  ProofSlot,
} from '../../components/fields.jsx';
import { BrandPicker } from '../../components/BrandPicker.jsx';
import {
  Banner,
  Card,
  Empty,
  LinkButton,
  Loading,
  PageHead,
  Pill,
} from '../../components/ui.jsx';

const TASK_STATUSES: TaskStatus[] = ['Not started', 'In progress', 'Blocked', 'Done'];

export function DailyLog() {
  const { date } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [errors, setErrors] = useState<string[]>([]);
  const [openError, setOpenError] = useState<string | null>(null);
  // Which account the per-brand fields are showing. Null until the screen loads.
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);

  const { data: home } = useQuery({
    queryKey: ['home'],
    queryFn: () => api.get<HomeDto>('/home'),
  });

  /**
   * With no date in the path: today when it is a working day, otherwise the most recent day
   * still waiting to be filled in. At a weekend with nothing outstanding there is no day at all.
   */
  const day =
    date ??
    (home
      ? home.todayIsWorkingDay
        ? home.today
        : (home.backfillDays.at(-1) ?? null)
      : undefined);

  const screen = useQuery({
    queryKey: ['entry', 'daily', day],
    queryFn: () => api.get<EntryScreenDto>(`/entries/screen/daily/${day!}`),
    enabled: Boolean(day),
    retry: false,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['entry', 'daily', day] });
    void queryClient.invalidateQueries({ queryKey: ['home'] });
  };

  const submit = useMutation({
    mutationFn: (entryId: string) => api.post<SubmitResult>(`/entries/${entryId}/submit`),
    onSuccess: (result) => {
      if (result.ok) {
        setErrors([]);
        toast.show(result.status === 'late' ? 'Submitted, marked late' : 'Submitted');
        refresh();
      } else {
        setErrors(result.errors);
        toast.show('Some things still need fixing');
      }
    },
    onError: (error) => {
      setErrors([error instanceof ApiProblem ? error.text : 'That could not be submitted']);
    },
  });

  const taskStatus = useMutation({
    mutationFn: (input: { id: string; status: TaskStatus; note?: string; proofUrl?: string }) =>
      api.post(`/tasks/${input.id}/status`, {
        status: input.status,
        note: input.note ?? null,
        proofUrl: input.proofUrl ?? null,
      }),
    onSuccess: () => {
      toast.show('Task updated');
      refresh();
    },
    onError: (error) => {
      toast.show(error instanceof ApiProblem ? error.text : 'That status could not be saved');
    },
  });

  const data = screen.data;

  const dayTabs: DayTab[] = useMemo(() => {
    if (!data) return [];
    const tabs: DayTab[] = data.backfillDays.map((d) => ({ day: d, note: 'Missing · late' }));
    if (!tabs.some((t) => t.day === data.today)) {
      tabs.push({ day: data.today, note: 'Today' });
    }
    if (day && !tabs.some((t) => t.day === day)) {
      tabs.unshift({ day, note: data.entry.status === 'unlocked' ? 'Unlocked' : 'Open' });
    }
    return tabs.sort((a, b) => a.day.localeCompare(b.day));
  }, [data, day]);

  if (day === undefined) return <Loading what="Opening the day" />;

  // A weekend, a holiday or leave, with nothing outstanding behind it.
  if (day === null) {
    return (
      <>
        <PageHead eyebrow="Daily log" title={formatDayLong(home!.today)} />
        <Card className="stack" tight>
          <span className="kicker">Nothing to log</span>
          <h2 style={{ fontSize: 22 }}>Today is not a working day for you.</h2>
          <p className="muted small" style={{ maxWidth: 520 }}>
            There is nothing outstanding either. The daily log opens again on your next working
            day.
          </p>
          <LinkButton to="/" tone="primary">
            Back to home
          </LinkButton>
        </Card>
      </>
    );
  }

  if (screen.isPending) return <Loading what="Opening the day" />;

  if (screen.error) {
    const message =
      screen.error instanceof ApiProblem ? screen.error.text : 'That day could not be opened';
    return (
      <>
        <PageHead eyebrow="Daily log" title={formatDayLong(day)} />
        <Banner tone="bad" role="alert" title={message} />
        <LinkButton to="/">Back to home</LinkButton>
      </>
    );
  }

  if (!data) return <Empty>That day could not be opened.</Empty>;

  const editable = data.entry.status === 'draft' || data.entry.status === 'unlocked';
  const brandId = selectedBrand ?? data.brands[0]?.id ?? null;
  const groups = [...new Set(data.fields.map((f) => f.groupName))];

  const mirror = checkDaily({
    periodStart: data.entry.periodStart,
    status: data.entry.status,
    fields: data.fields,
    values: data.entry.values,
    attachments: data.entry.attachments,
    dueTasks: data.dueTasks,
    missingDaysInWindow: data.backfillDays.filter((d) => d !== data.entry.periodStart),
    today: data.today,
    withinBackfill: data.withinBackfill,
    fourWeekAverage: data.fourWeekAverage,
    spikeMultiplier: data.spikeMultiplier,
    spikeMinAverage: data.spikeMinAvg,
  });

  const progress = dailyProgress({ fields: data.fields, values: data.entry.values });
  const outstandingTasks = data.dueTasks.filter((t) => !t.hasUpdateForDay);

  return (
    <>
      <PageHead
        eyebrow="Daily log"
        title={formatDayLong(data.entry.periodStart)}
        actions={
          <DayTabs
            days={dayTabs}
            selected={data.entry.periodStart}
            onSelect={(next) => {
              setErrors([]);
              setOpenError(null);
              navigate(`/daily/${next}`);
            }}
          />
        }
      />

      {openError ? <Banner tone="bad" role="alert" title={openError} /> : null}

      {editable && data.brands.length > 0 ? (
        <BrandPicker
          brands={data.brands}
          value={brandId ?? ''}
          onChange={setSelectedBrand}
          fields={data.fields}
          values={data.entry.values}
        />
      ) : null}

      {data.entry.periodStart < data.today && editable ? (
        <Banner
          tone="info"
          title="You are filling in an earlier day"
          body="It will show as late on the team dashboard. Today is not waiting on it."
        />
      ) : null}

      {editable ? (
        <Banner
          tone="info"
          title="Put down what actually happened"
          body="These numbers become the weekly report and the decisions made from it, so an honest zero is far more useful than a rounded-up guess. A quiet day is a normal day."
        />
      ) : null}

      {data.entry.status === 'unlocked' ? (
        <Banner
          tone="warn"
          title="Raphy unlocked this day"
          body={data.entry.unlockReason ?? 'Make the correction and submit again.'}
        />
      ) : null}

      {!editable ? (
        <Card className="stack" tight>
          <span className="kicker" style={{ color: 'var(--good)' }}>
            Submitted and locked
          </span>
          <h2 style={{ fontSize: 22 }}>
            {data.entry.status === 'late'
              ? 'This day went in late.'
              : 'This day is signed off.'}
          </h2>
          <p className="muted small" style={{ maxWidth: 520 }}>
            Raphy sees it on the dashboard. To correct something, ask Raphy to unlock the entry.
          </p>
          <LinkButton to="/" tone="primary">
            Back to home
          </LinkButton>
        </Card>
      ) : null}

      <div className="split">
        <div className="col-main">
          {groups.map((group) => (
            <Card as="section" key={group} className="stack" tight>
              <div className="between" style={{ minHeight: 40 }}>
                <h2>{group}</h2>
                <span className="mono xs faint">
                  {
                    data.fields.filter(
                      (f) =>
                        f.groupName === group &&
                        data.entry.values.some(
                          (v) =>
                            v.metricKey === f.key &&
                            v.numValue !== null &&
                            v.brandId === (f.perBrand && data.brands.length > 0 ? brandId : null),
                        ),
                    ).length
                  }{' '}
                  of {data.fields.filter((f) => f.groupName === group).length}
                </span>
              </div>

              {data.fields
                .filter((field) => field.groupName === group)
                .map((field) => (
                  <FieldRow
                    // Keyed by brand so inputs reset to that account's values on switch.
                    key={`${field.key}-${field.perBrand ? brandId : 'all'}`}
                    field={field}
                    data={data}
                    editable={editable}
                    onChanged={refresh}
                    selectedBrand={brandId}
                  />
                ))}
            </Card>
          ))}

          {data.dueTasks.length > 0 ? (
            <Card as="section" className="stack" tight>
              <div className="between" style={{ minHeight: 40 }}>
                <h2>Backlog tasks due</h2>
                <span className="mono xs faint">
                  {data.dueTasks.length - outstandingTasks.length} of {data.dueTasks.length}
                </span>
              </div>
              {data.dueTasks.map((task) => (
                <div className="frow" key={task.id}>
                  <span className="flabel">
                    <b>{task.title}</b>
                    <span
                      className="hint"
                      style={
                        task.dueDate < data.entry.periodStart ? { color: 'var(--bad)' } : undefined
                      }
                    >
                      {task.dueDate < data.entry.periodStart
                        ? `Overdue · was due ${formatDayShort(task.dueDate)}`
                        : `Due ${formatDayShort(task.dueDate)}`}
                      {task.hasUpdateForDay ? ' · updated' : ''}
                    </span>
                  </span>
                  {task.hasUpdateForDay ? (
                    <Pill tone="good">{task.status}</Pill>
                  ) : (
                    <TaskStatusPicker
                      disabled={!editable || taskStatus.isPending}
                      onPick={(status, note, proofUrl) =>
                        taskStatus.mutate({ id: task.id, status, note, proofUrl })
                      }
                    />
                  )}
                </div>
              ))}
            </Card>
          ) : null}
        </div>

        <ProgressAside
          done={progress.done}
          total={progress.total}
          missing={progress.missing}
          errors={errors}
          canSubmit={editable && mirror.ok}
          submitting={submit.isPending}
          onSubmit={() => submit.mutate(data.entry.id)}
        >
          <p className="xs faint">
            Submitting locks the entry. Only Raphy can unlock it, and every change is recorded.
          </p>
        </ProgressAside>
      </div>
    </>
  );
}

function FieldRow({
  field,
  data,
  editable,
  onChanged,
  selectedBrand,
}: {
  field: MetricDefinition;
  data: EntryScreenDto;
  editable: boolean;
  onChanged: () => void;
  selectedBrand: string | null;
}) {
  // Channel measures belong to one account at a time; CRM work is a single shared total.
  const brandId = field.perBrand && data.brands.length > 0 ? selectedBrand : null;
  const value = data.entry.values.find(
    (v) => v.metricKey === field.key && v.brandId === brandId,
  );
  const number = value?.numValue ?? null;
  const average = data.fourWeekAverage[field.key] ?? 0;
  const needsNote =
    number !== null &&
    average >= data.spikeMinAvg &&
    number > data.spikeMultiplier * average &&
    (value?.note ?? '').trim() === '';

  const hint =
    field.key === 'contacts_filtered'
      ? 'Cannot be more than contacts added'
      : field.proof === 'file'
        ? 'Screenshot needed if more than 0'
        : field.proof === 'link'
          ? 'Link needed if more than 0'
          : 'No proof needed';

  return (
    <div className="fwrap">
      <div className="frow">
        <span className="flabel">
          <b>{field.label}</b>
          <span className="hint">{hint}</span>
        </span>
        <NumberField
          brandId={brandId}
          entryId={data.entry.id}
          field={field}
          initialValue={number}
          readOnly={!editable}
          onSaved={onChanged}
        />
        <div className="proof">
          {field.proof === 'file' ? (
            <ProofSlot
              entryId={data.entry.id}
              metricKey={field.key}
              attachments={data.entry.attachments}
              readOnly={!editable}
              onChanged={onChanged}
            />
          ) : field.proof === 'link' ? (
            <LinkField
              entryId={data.entry.id}
              field={field}
              initialValue={value?.textValue ?? null}
              readOnly={!editable}
              onSaved={onChanged}
            />
          ) : null}
        </div>
      </div>
      {needsNote ? (
        <NoteField
          entryId={data.entry.id}
          metricKey={field.key}
          initialValue={value?.note ?? null}
          readOnly={!editable}
        />
      ) : null}
    </div>
  );
}

function TaskStatusPicker({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (status: TaskStatus, note?: string, proofUrl?: string) => void;
}) {
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const [note, setNote] = useState('');
  const [proof, setProof] = useState('');

  const needsNote = status === 'Blocked';
  const needsProof = status === 'Done';

  return (
    <div className="stack" style={{ gap: 8, width: 260 }}>
      <label className="sr-only" htmlFor={`status-${String(status)}`}>
        Update status
      </label>
      <select
        className="select"
        value={status}
        disabled={disabled}
        onChange={(event) => setStatus(event.target.value as TaskStatus | '')}
      >
        <option value="">Update status</option>
        {TASK_STATUSES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      {needsNote ? (
        <input
          className="input"
          placeholder="What is blocking you?"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      ) : null}
      {needsProof ? (
        <input
          className="input"
          type="url"
          placeholder="https://link to the proof"
          value={proof}
          onChange={(event) => setProof(event.target.value)}
        />
      ) : null}

      {status ? (
        <button
          type="button"
          className="btn btn-sm"
          disabled={disabled || (needsNote && note.trim() === '') || (needsProof && proof.trim() === '')}
          onClick={() => onPick(status, note || undefined, proof || undefined)}
        >
          Save status
        </button>
      ) : null}
    </div>
  );
}
