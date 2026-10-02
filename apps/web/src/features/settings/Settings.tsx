/** Targets, fields per person, reminder times and users (design/settings.html). */

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  TARGET_MEASURES,
  type AppSettingsDto,
  type MetricDefinition,
  type Profile,
  type ReminderRuleDto,
  type UserSettingRowDto,
} from '@gtm/shared';
import { api, ApiProblem } from '../../api.js';
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
  Segmented,
  Switch,
  Scrollable,
} from '../../components/ui.jsx';

interface SettingsScreen {
  people: Profile[];
  metrics: MetricDefinition[];
  settings: UserSettingRowDto[];
  reminders: ReminderRuleDto[];
  app: AppSettingsDto;
}

type Tab = 'targets' | 'fields' | 'reminders' | 'users';

export function Settings() {
  const [tab, setTab] = useState<Tab>('targets');

  const { data, isPending } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<SettingsScreen>('/admin/settings'),
  });

  if (isPending) return <Loading what="Loading settings" />;
  if (!data) return <Empty>Settings could not be loaded.</Empty>;

  const contributors = data.people.filter((p) => p.active && p.role === 'contributor');

  return (
    <>
      <PageHead
        eyebrow="Setup"
        title="Targets and fields"
        actions={
          <Segmented<Tab>
            label="Settings section"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'targets', label: 'Targets' },
              { value: 'fields', label: 'Fields' },
              { value: 'reminders', label: 'Reminders' },
              { value: 'users', label: 'Users' },
            ]}
          />
        }
      />

      {tab === 'targets' ? <Targets data={data} people={contributors} /> : null}
      {tab === 'fields' ? <Fields data={data} people={contributors} /> : null}
      {tab === 'reminders' ? <Reminders data={data} /> : null}
      {tab === 'users' ? <Users people={data.people} /> : null}
    </>
  );
}

// ---------- ADM-01 ----------
function Targets({ data, people }: { data: SettingsScreen; people: Profile[] }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const person of people) {
      for (const key of TARGET_MEASURES) {
        const row = data.settings.find((s) => s.userId === person.id && s.metricKey === key);
        next[`${person.id}:${key}`] = row?.weeklyTarget === null || row?.weeklyTarget === undefined
          ? ''
          : String(row.weeklyTarget);
      }
    }
    setDraft(next);
  }, [data.settings, people]);

  const save = useMutation({
    mutationFn: () =>
      api.put('/admin/settings/targets', {
        targets: Object.entries(draft).map(([compound, value]) => {
          const [userId, metricKey] = compound.split(':');
          return {
            userId: userId!,
            metricKey: metricKey!,
            weeklyTarget: value.trim() === '' ? null : Number(value),
          };
        }),
      }),
    onSuccess: () => {
      toast.show('Targets saved');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
  });

  const label = (key: string) => data.metrics.find((m) => m.key === key)?.label ?? key;

  return (
    <Card as="section">
      <CardHead title="Weekly targets" sub="Per person, per measure" />
      <Scrollable label="Weekly targets per person">
        <table className="table">
          <caption className="sr-only">Weekly targets per person</caption>
          <thead>
            <tr>
              <th scope="col">Measure</th>
              {people.map((person) => (
                <th key={person.id} scope="col" className="num">
                  {person.fullName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TARGET_MEASURES.map((key) => (
              <tr key={key}>
                <td>{label(key)}</td>
                {people.map((person) => (
                  <td key={person.id} className="num">
                    <label className="sr-only" htmlFor={`t-${person.id}-${key}`}>
                      {label(key)} target for {person.fullName}
                    </label>
                    <input
                      id={`t-${person.id}-${key}`}
                      className="input num"
                      type="number"
                      min={0}
                      value={draft[`${person.id}:${key}`] ?? ''}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [`${person.id}:${key}`]: event.target.value,
                        }))
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Scrollable>
      <Button tone="primary" onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? 'Saving…' : 'Save the targets'}
      </Button>
    </Card>
  );
}

// ---------- ADM-02 ----------
function Fields({ data, people }: { data: SettingsScreen; people: Profile[] }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const save = useMutation({
    mutationFn: (row: { userId: string; metricKey: string; enabled: boolean }) =>
      api.put('/admin/settings/fields', { fields: [row] }),
    onSuccess: () => {
      toast.show('Saved');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
  });

  const enabled = (userId: string, metricKey: string) =>
    data.settings.find((s) => s.userId === userId && s.metricKey === metricKey)?.enabled ?? true;

  return (
    <Card as="section">
      <CardHead title="Fields each person logs" sub="Switch a field off and it leaves their next log" />
      <Scrollable label="Which fields each person logs">
        <table className="table">
          <caption className="sr-only">Which fields each person logs</caption>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Log</th>
              {people.map((person) => (
                <th key={person.id} scope="col">
                  {person.fullName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.metrics
              .filter((metric) => metric.autoFrom === null)
              .map((metric) => (
                <tr key={metric.key}>
                  <td>{metric.label}</td>
                  <td>
                    <Pill>{metric.logType}</Pill>
                  </td>
                  {people.map((person) => (
                    <td key={person.id}>
                      <Switch
                        checked={enabled(person.id, metric.key)}
                        label={`${metric.label} for ${person.fullName}`}
                        disabled={save.isPending}
                        onChange={(value) =>
                          save.mutate({
                            userId: person.id,
                            metricKey: metric.key,
                            enabled: value,
                          })
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </Scrollable>
    </Card>
  );
}

// ---------- ADM-03 ----------
function Reminders({ data }: { data: SettingsScreen }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [rules, setRules] = useState(data.reminders);
  const [recipients, setRecipients] = useState(data.app.reportRecipients.join(', '));

  useEffect(() => setRules(data.reminders), [data.reminders]);

  const save = useMutation({
    mutationFn: () =>
      api.put('/admin/settings/reminders', {
        rules: rules.map((rule) => ({
          key: rule.key,
          localTime: rule.localTime,
          email: rule.email,
          inApp: rule.inApp,
          active: rule.active,
        })),
      }),
    onSuccess: () => {
      toast.show('Reminders saved');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
  });

  const saveApp = useMutation({
    mutationFn: () =>
      api.put('/admin/settings/app', {
        reportRecipients: recipients
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      toast.show('Report recipients saved');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
  });

  const update = (key: string, patch: Partial<ReminderRuleDto>) =>
    setRules((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <>
      <Card as="section">
        <CardHead title="Reminder times" sub="In each person's own time zone" />
        <Scrollable label="Reminder rules">
          <table className="table">
            <caption className="sr-only">Reminder rules</caption>
            <thead>
              <tr>
                <th scope="col">Reminder</th>
                <th scope="col">Time</th>
                <th scope="col">Email</th>
                <th scope="col">In app</th>
                <th scope="col">On</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.key}>
                  <td>
                    <b className="small">{rule.description}</b>
                    {rule.toAdmin ? (
                      <span className="xs faint" style={{ display: 'block' }}>
                        Also goes to admins
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`time-${rule.key}`}>
                      Time for {rule.description}
                    </label>
                    <input
                      id={`time-${rule.key}`}
                      className="input"
                      type="time"
                      style={{ width: 120 }}
                      value={rule.localTime}
                      onChange={(event) => update(rule.key, { localTime: event.target.value })}
                    />
                  </td>
                  <td>
                    <Switch
                      checked={rule.email}
                      label={`Email for ${rule.description}`}
                      onChange={(value) => update(rule.key, { email: value })}
                    />
                  </td>
                  <td>
                    <Switch
                      checked={rule.inApp}
                      label={`In app for ${rule.description}`}
                      onChange={(value) => update(rule.key, { inApp: value })}
                    />
                  </td>
                  <td>
                    <Switch
                      checked={rule.active}
                      label={`${rule.description} switched on`}
                      onChange={(value) => update(rule.key, { active: value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scrollable>
        <Button tone="primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save the reminders'}
        </Button>
      </Card>

      <Card as="section">
        <CardHead title="Monday report" sub="Sent at 09:00 India time" />
        <div className="field">
          <label htmlFor="recipients">Who receives it</label>
          <input
            id="recipients"
            className="input"
            value={recipients}
            onChange={(event) => setRecipients(event.target.value)}
          />
          <span className="hint">Email addresses, separated by commas. Empty means nobody.</span>
        </div>
        <Button onClick={() => saveApp.mutate()} disabled={saveApp.isPending}>
          Save the recipients
        </Button>
      </Card>
    </>
  );
}

// ---------- ADM-05 ----------
function Users({ people }: { people: Profile[] }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [inviting, setInviting] = useState(false);

  const setActive = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      api.patch(`/admin/users/${input.id}`, { active: input.active }),
    onSuccess: (_result, input) => {
      toast.show(input.active ? 'Account switched on' : 'Account switched off');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      void queryClient.invalidateQueries({ queryKey: ['people'] });
    },
  });

  return (
    <Card as="section">
      <CardHead
        title="People"
        actions={
          <Button tone="primary" onClick={() => setInviting(true)}>
            Invite someone
          </Button>
        }
      />
      <Scrollable label="People with accounts">
        <table className="table">
          <caption className="sr-only">People with accounts</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Time zone</th>
              <th scope="col">Active</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.id}>
                <td>
                  <b className="small">{person.fullName}</b>
                </td>
                <td className="small muted">{person.email}</td>
                <td>
                  <Pill>{person.role}</Pill>
                </td>
                <td className="mono xs">{person.timezone}</td>
                <td>
                  <Switch
                    checked={person.active}
                    label={`${person.fullName} is active`}
                    disabled={setActive.isPending}
                    onChange={(value) => setActive.mutate({ id: person.id, active: value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Scrollable>
      <p className="xs faint">
        Switching someone off ends their sessions straight away and stops them signing in.
      </p>

      {inviting ? <Invite onClose={() => setInviting(false)} /> : null}
    </Card>
  );
}

function Invite({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'admin' | 'contributor' | 'viewer'>('contributor');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [error, setError] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: () => api.post('/admin/users/invite', { email, fullName, role, timezone }),
    onSuccess: () => {
      toast.show('Invited. The set-password link is on its way.');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      onClose();
    },
    onError: (problem) =>
      setError(problem instanceof ApiProblem ? problem.text : 'That invite could not be sent'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Invite someone"
      footer={
        <Button
          tone="primary"
          disabled={email.trim() === '' || fullName.trim() === '' || invite.isPending}
          onClick={() => invite.mutate()}
        >
          {invite.isPending ? 'Sending…' : 'Send the invite'}
        </Button>
      }
    >
      <div className="field">
        <label htmlFor="invite-name">Full name</label>
        <input
          id="invite-name"
          className="input"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="invite-email">Work email</label>
        <input
          id="invite-email"
          className="input"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="invite-role">Role</label>
        <select
          id="invite-role"
          className="select"
          value={role}
          onChange={(event) => setRole(event.target.value as typeof role)}
        >
          <option value="contributor">Contributor</option>
          <option value="admin">Admin</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="invite-tz">Time zone</label>
        <select
          id="invite-tz"
          className="select"
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
        >
          {['Asia/Kolkata', 'Asia/Dubai', 'Asia/Riyadh', 'Europe/London', 'UTC'].map((zone) => (
            <option key={zone}>{zone}</option>
          ))}
        </select>
      </div>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <p className="xs faint">They get a link that works for 48 hours.</p>
    </Modal>
  );
}
