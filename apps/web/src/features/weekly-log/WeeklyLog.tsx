/** The weekly log (design/weekly-log.html). */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkWeekly,
  formatGrowth,
  formatNumber,
  formatWeekRange,
  growth,
  weeklyProgress,
  type EntryScreenDto,
  type MetricDefinition,
  type SearchKind,
  type SubmitResult,
} from '@gtm/shared';
import { api, ApiProblem } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import {
  LinkField,
  NumberField,
  ProgressAside,
  ProofSlot,
  TextField,
} from '../../components/fields.jsx';
import {
  Banner,
  Button,
  Card,
  Empty,
  LinkButton,
  Loading,
  PageHead,
  Pill,
  Switch,
} from '../../components/ui.jsx';

const SEARCH_KINDS: SearchKind[] = ['SEO', 'AEO', 'GEO'];

export function WeeklyLog() {
  const { monday } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [errors, setErrors] = useState<string[]>([]);

  const { data: home } = useQuery({
    queryKey: ['home'],
    queryFn: () => api.get<{ weekMonday: string }>('/home'),
  });
  const week = monday ?? home?.weekMonday;

  const screen = useQuery({
    queryKey: ['entry', 'weekly', week],
    queryFn: () => api.get<EntryScreenDto>(`/entries/screen/weekly/${week!}`),
    enabled: Boolean(week),
    retry: false,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['entry', 'weekly', week] });
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
  });

  if (!week || screen.isPending) return <Loading what="Opening the week" />;

  if (screen.error) {
    return (
      <>
        <PageHead eyebrow="Weekly log" title={formatWeekRange(week)} />
        <Banner
          tone="bad"
          role="alert"
          title={screen.error instanceof ApiProblem ? screen.error.text : 'That week could not be opened'}
        />
        <LinkButton to="/">Back to home</LinkButton>
      </>
    );
  }

  const data = screen.data;
  if (!data) return <Empty>That week could not be opened.</Empty>;

  const editable = data.entry.status === 'draft' || data.entry.status === 'unlocked';
  const autoTotals = data.autoTotals ?? {};
  const isOpen = data.weeklyIsOpen ?? false;

  const check = checkWeekly({
    periodStart: data.entry.periodStart,
    status: data.entry.status,
    fields: data.fields,
    values: data.entry.values,
    attachments: data.entry.attachments,
    searchActivities: data.entry.searchActivities,
    noSearchActivity: data.entry.noSearchActivity,
    missingDaysThisWeek: data.missingDays,
    ownsActiveAbmAccount: data.ownsActiveAbmAccount ?? false,
    pickedAbmAccountIds: data.entry.abmAccountIds,
    isOpen,
  });

  const progress = weeklyProgress({
    periodStart: data.entry.periodStart,
    status: data.entry.status,
    fields: data.fields,
    values: data.entry.values,
    attachments: data.entry.attachments,
    searchActivities: data.entry.searchActivities,
    noSearchActivity: data.entry.noSearchActivity,
    missingDaysThisWeek: data.missingDays,
    ownsActiveAbmAccount: data.ownsActiveAbmAccount ?? false,
    pickedAbmAccountIds: data.entry.abmAccountIds,
    isOpen,
  });

  const groups = [...new Set(data.fields.map((f) => f.groupName))];
  const followers = data.entry.values.find((v) => v.metricKey === 'wk_followers')?.numValue ?? null;
  const followerGrowth = growth(followers, data.previousFollowers ?? null);

  return (
    <>
      <PageHead
        eyebrow="Weekly log"
        title={formatWeekRange(data.entry.periodStart)}
        actions={
          <div className="row">
            <Button small onClick={() => navigate(`/weekly/${shift(week, -7)}`)}>
              Previous week
            </Button>
            <Button small onClick={() => navigate(`/weekly/${shift(week, 7)}`)}>
              Next week
            </Button>
          </div>
        }
      />

      {!isOpen && editable ? (
        <Banner
          tone="info"
          title="This is a preview"
          body="The weekly log opens on Friday at 16:00. You can fill it in now, but it cannot be submitted yet."
        />
      ) : null}

      {data.missingDays.length > 0 ? (
        <Banner
          tone="bad"
          role="alert"
          title={`${data.missingDays.length} daily ${data.missingDays.length === 1 ? 'log is' : 'logs are'} missing from this week`}
          body="Submit the missing daily logs before signing the week off."
          action={<LinkButton to={`/daily/${data.missingDays[0]!}`}>Fill them in</LinkButton>}
        />
      ) : null}

      {!editable ? (
        <Banner
          tone="good"
          title={data.entry.status === 'late' ? 'Submitted late' : 'Submitted'}
          body="The week is signed off and locked. Ask Raphy to unlock it if something needs correcting."
        />
      ) : null}

      <div className="split">
        <div className="col-main">
          <Card as="section" className="stack" tight>
            <div className="between" style={{ minHeight: 40 }}>
              <h2>From your daily logs</h2>
              <span className="mono xs faint">Read only</span>
            </div>
            {Object.keys(autoTotals).length === 0 ? (
              <p className="small muted">Nothing is totalled for this week yet.</p>
            ) : (
              Object.entries(autoTotals).map(([key, total]) => (
                <div className="frow" key={key}>
                  <span className="flabel">
                    <b>{autoLabel(key)}</b>
                    <span className="hint">Added up from your submitted daily logs</span>
                  </span>
                  <span className="mono" style={{ fontSize: 16 }}>
                    {formatNumber(total)}
                  </span>
                </div>
              ))
            )}
          </Card>

          {groups.map((group) => (
            <Card as="section" key={group} className="stack" tight>
              <div className="between" style={{ minHeight: 40 }}>
                <h2>{group}</h2>
              </div>
              {data.fields
                .filter((field) => field.groupName === group)
                .map((field) =>
                  field.key === 'wk_search' ? (
                    <SearchActivities
                      key={field.key}
                      data={data}
                      editable={editable}
                      onChanged={refresh}
                    />
                  ) : (
                    <WeeklyField
                      key={field.key}
                      field={field}
                      data={data}
                      editable={editable}
                      onChanged={refresh}
                      extra={
                        field.key === 'wk_followers' && followerGrowth.change !== null ? (
                          <span className="xs muted">
                            {formatGrowth(followerGrowth)} on last week
                          </span>
                        ) : null
                      }
                    />
                  ),
                )}
            </Card>
          ))}

          {(data.ownedAbmAccounts?.length ?? 0) > 0 ? (
            <AbmPicker data={data} editable={editable} onChanged={refresh} />
          ) : null}
        </div>

        <ProgressAside
          done={progress.done}
          total={progress.total}
          missing={progress.missing}
          errors={errors}
          canSubmit={editable && check.ok}
          submitting={submit.isPending}
          onSubmit={() => submit.mutate(data.entry.id)}
        >
          <p className="xs faint">
            Due Monday at 12:00. After that the week is marked late.
          </p>
        </ProgressAside>
      </div>
    </>
  );
}

const AUTO_LABEL: Record<string, string> = {
  wk_accounts_added: 'Accounts added',
  wk_emails: 'Emails sent',
  wk_replies: 'Replies',
  wk_posts: 'Posts',
};
const autoLabel = (key: string): string => AUTO_LABEL[key] ?? key;

function WeeklyField({
  field,
  data,
  editable,
  onChanged,
  extra,
}: {
  field: MetricDefinition;
  data: EntryScreenDto;
  editable: boolean;
  onChanged: () => void;
  extra?: React.ReactNode;
}) {
  // A per-brand measure is answered once for each brand the person runs. Rendering a labelled
  // row per brand is what makes "which account is this?" answerable at the point of entry.
  if (field.perBrand && data.brands.length > 0 && field.valueType !== 'file') {
    return (
      <div className="brand-group">
        <div className="brand-group-head">
          <b>{field.label}</b>
          <span className="hint">One figure per account</span>
        </div>
        {data.brands.map((brand) => {
          const brandValue = data.entry.values.find(
            (v) => v.metricKey === field.key && v.brandId === brand.id,
          );
          return (
            <div className="frow brand-row" key={brand.id}>
              <span className="flabel">
                <b className="brand-name">{brand.name}</b>
              </span>
              {field.valueType === 'text' ? (
                <TextField
                  entryId={data.entry.id}
                  field={field}
                  initialValue={brandValue?.textValue ?? null}
                  readOnly={!editable}
                  rows={2}
                  brandId={brand.id}
                  onSaved={onChanged}
                />
              ) : (
                <NumberField
                  entryId={data.entry.id}
                  field={field}
                  initialValue={brandValue?.numValue ?? null}
                  readOnly={!editable}
                  brandId={brand.id}
                  onSaved={onChanged}
                />
              )}
            </div>
          );
        })}
        {extra}
      </div>
    );
  }

  const value = data.entry.values.find((v) => v.metricKey === field.key && v.brandId === null);

  if (field.valueType === 'text') {
    const forms = data.entry.values.find((v) => v.metricKey === 'wk_forms')?.numValue ?? 0;
    if (field.key === 'wk_form_companies' && forms === 0) return null;
    return (
      <div style={{ padding: '12px 0' }}>
        <TextField
          entryId={data.entry.id}
          field={field}
          initialValue={value?.textValue ?? null}
          readOnly={!editable}
          rows={field.groupName === 'Reflection' ? 3 : 2}
          onSaved={onChanged}
        />
      </div>
    );
  }

  if (field.valueType === 'file') {
    return (
      <div className="frow">
        <span className="flabel">
          <b>{field.label}</b>
          <span className="hint">Upload the file</span>
        </span>
        <div className="proof">
          <ProofSlot
            entryId={data.entry.id}
            metricKey={field.key}
            attachments={data.entry.attachments}
            readOnly={!editable}
            onChanged={onChanged}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="frow">
      <span className="flabel">
        <b>{field.label}</b>
        <span className="hint">
          {field.proof === 'file'
            ? 'Screenshot needed if more than 0'
            : field.valueType === 'percent'
              ? '0 to 100'
              : 'Whole number'}
        </span>
        {extra}
      </span>
      <NumberField
        entryId={data.entry.id}
        field={field}
        initialValue={value?.numValue ?? null}
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
  );
}

function SearchActivities({
  data,
  editable,
  onChanged,
}: {
  data: EntryScreenDto;
  editable: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<SearchKind>('SEO');
  const [description, setDescription] = useState('');
  const [link, setLink] = useState('');

  const add = useMutation({
    mutationFn: () =>
      api.post(`/entries/${data.entry.id}/search-activities`, {
        kind,
        description,
        link: link.trim() === '' ? null : link.trim(),
      }),
    onSuccess: () => {
      setDescription('');
      setLink('');
      onChanged();
    },
    onError: (error) =>
      toast.show(error instanceof ApiProblem ? error.text : 'That row could not be added'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/search-activities/${id}`),
    onSuccess: onChanged,
  });

  const none = useMutation({
    mutationFn: (value: boolean) =>
      api.patch(`/entries/${data.entry.id}`, { noSearchActivity: value }),
    onSuccess: onChanged,
  });

  return (
    <div className="stack" style={{ padding: '12px 0', gap: 12 }}>
      <div className="between">
        <b className="small">SEO, AEO and GEO activities</b>
        <label className="row xs muted" style={{ gap: 8 }}>
          <Switch
            checked={data.entry.noSearchActivity}
            disabled={!editable || none.isPending}
            label="None this week"
            onChange={(value) => none.mutate(value)}
          />
          None this week
        </label>
      </div>

      {data.entry.searchActivities.length === 0 ? (
        <p className="small muted">
          {data.entry.noSearchActivity ? 'Marked as none this week.' : 'No rows yet.'}
        </p>
      ) : (
        data.entry.searchActivities.map((row) => (
          <div className="frow" key={row.id}>
            <span className="flabel">
              <b>
                <Pill tone="info">{row.kind}</Pill> {row.description}
              </b>
              {row.link ? (
                <a className="hint" href={row.link} target="_blank" rel="noopener noreferrer">
                  {row.link}
                </a>
              ) : null}
            </span>
            {editable ? (
              <Button small tone="ghost" onClick={() => remove.mutate(row.id)}>
                Remove
              </Button>
            ) : null}
          </div>
        ))
      )}

      {editable && !data.entry.noSearchActivity ? (
        <div className="row wrap" style={{ gap: 8 }}>
          <label className="sr-only" htmlFor="search-kind">
            Kind
          </label>
          <select
            id="search-kind"
            className="select"
            style={{ width: 110 }}
            value={kind}
            onChange={(event) => setKind(event.target.value as SearchKind)}
          >
            {SEARCH_KINDS.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="search-what">
            What you did
          </label>
          <input
            id="search-what"
            className="input"
            style={{ flex: 1, minWidth: 180 }}
            placeholder="What you did"
            maxLength={300}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <label className="sr-only" htmlFor="search-link">
            Link
          </label>
          <input
            id="search-link"
            className="input"
            style={{ width: 180 }}
            type="url"
            placeholder="Link (optional)"
            value={link}
            onChange={(event) => setLink(event.target.value)}
          />
          <Button
            small
            disabled={description.trim() === '' || add.isPending}
            onClick={() => add.mutate()}
          >
            Add row
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AbmPicker({
  data,
  editable,
  onChanged,
}: {
  data: EntryScreenDto;
  editable: boolean;
  onChanged: () => void;
}) {
  const picked = new Set(data.entry.abmAccountIds);

  const save = useMutation({
    mutationFn: (accountIds: string[]) =>
      api.put(`/entries/${data.entry.id}/abm-accounts`, { accountIds }),
    onSuccess: onChanged,
  });

  return (
    <Card as="section" className="stack" tight>
      <div className="between" style={{ minHeight: 40 }}>
        <h2>ABM accounts worked this week</h2>
        <span className="mono xs faint">{picked.size} picked</span>
      </div>
      {(data.ownedAbmAccounts ?? []).map((account) => (
        <div className="frow" key={account.id}>
          <span className="flabel">
            <b>{account.name}</b>
            <span className="hint">
              {account.vertical} · {account.region} · {account.stage}
            </span>
          </span>
          <Switch
            checked={picked.has(account.id)}
            disabled={!editable || save.isPending}
            label={`Worked on ${account.name} this week`}
            onChange={(checked) => {
              const next = new Set(picked);
              if (checked) next.add(account.id);
              else next.delete(account.id);
              save.mutate([...next]);
            }}
          />
        </div>
      ))}
    </Card>
  );
}

function shift(monday: string, days: number): string {
  const date = new Date(`${monday}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
