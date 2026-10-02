/** The ABM tracker (design/abm-tracker.html): board, one-a-week strip and the account drawer. */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ABM_STAGES,
  formatWeek,
  REGIONS,
  VERTICALS,
  type AbmAccountDto,
  type AbmScreenDto,
  type AbmStage,
  type Profile,
  type Region,
  type Vertical,
} from '@gtm/shared';
import { api, ApiProblem } from '../../api.js';
import { useUser } from '../../auth.jsx';
import { useToast } from '../../components/Toast.jsx';
import { Drawer, Modal } from '../../components/Overlay.jsx';
import {
  Banner,
  Button,
  Card,
  CardHead,
  Empty,
  ErrorNote,
  Loading,
  PageHead,
  Pill,
  Scrollable,
} from '../../components/ui.jsx';

export function AbmTracker() {
  const user = useUser();
  const queryClient = useQueryClient();
  const [openAccount, setOpenAccount] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ['abm'],
    queryFn: () => api.get<AbmScreenDto>('/abm'),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['abm'] });

  if (isPending) return <Loading what="Loading the ABM tracker" />;
  if (!data) return <Empty>The tracker could not be loaded.</Empty>;

  const thisWeek = data.weekPlan.at(-1);
  const missedWeeks = data.weekPlan.filter((w) => w.missed).length;

  return (
    <>
      <PageHead
        eyebrow="ABM"
        title="One new account live every week"
        actions={
          user.role === 'admin' ? (
            <Button tone="primary" onClick={() => setAdding(true)}>
              Add an account
            </Button>
          ) : undefined
        }
      />

      {thisWeek && !thisWeek.account ? (
        <Banner
          tone="bad"
          role="alert"
          title="No account is planned for this week"
          body="The one-a-week plan needs an account for the current week."
        />
      ) : thisWeek && !thisWeek.account?.isLive ? (
        <Banner
          tone="warn"
          title={`${thisWeek.account!.name} is not live yet`}
          body={`It is at ${thisWeek.account!.stage}, and is due live by Friday.`}
        />
      ) : null}

      <Card as="section">
        <CardHead
          title="The last 12 weeks"
          sub={`${12 - missedWeeks} of 12 weeks hit`}
        />
        <Scrollable label="The last 12 weeks">
          <div className="row" style={{ gap: 8, minWidth: 720 }}>
            {data.weekPlan.map((week) => (
              <div
                key={week.week}
                className="card tight stack"
                style={{
                  gap: 4,
                  minWidth: 120,
                  background: week.missed ? 'var(--bad-bg)' : 'var(--surface)',
                  borderColor: week.missed ? 'var(--bad-line)' : 'var(--border)',
                }}
              >
                <span className={`mono xs ${week.missed ? 'muted' : 'faint'}`}>
                  {formatWeek(week.week).replace('Week of ', '')}
                </span>
                {week.account ? (
                  <>
                    <b className="small">{week.account.name}</b>
                    <span className="xs muted">{week.account.stage}</span>
                  </>
                ) : (
                  <b className="small" style={{ color: 'var(--bad)' }}>
                    No account
                  </b>
                )}
              </div>
            ))}
          </div>
        </Scrollable>
      </Card>

      <Card as="section">
        <CardHead title="Accounts by stage" sub={`${data.accounts.length} accounts`} />
        <Scrollable label="ABM accounts by stage" className="board">
          {ABM_STAGES.map((stage) => {
            const inStage = data.accounts.filter((a) => a.stage === stage);
            return (
              <div className="col" key={stage}>
                <div className="col-head">
                  <span>{stage}</span>
                  <span className="mono xs faint">{inStage.length}</span>
                </div>
                {inStage.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    className="acc"
                    onClick={() => setOpenAccount(account.id)}
                  >
                    <b>{account.name}</b>
                    <span className="xs muted">
                      {account.vertical} · {account.region}
                    </span>
                    <span className="xs faint">
                      {account.ownerName} · {formatWeek(account.plannedWeek)}
                    </span>
                  </button>
                ))}
                {inStage.length === 0 ? <span className="xs faint">Nothing here</span> : null}
              </div>
            );
          })}
        </Scrollable>
      </Card>

      {openAccount ? (
        <AccountDrawer
          account={data.accounts.find((a) => a.id === openAccount)!}
          currentWeek={data.currentWeek}
          touches={data.touches}
          canEdit={user.role === 'admin' || data.accounts.find((a) => a.id === openAccount)!.ownerId === user.id}
          isAdmin={user.role === 'admin'}
          onClose={() => setOpenAccount(null)}
          onChanged={refresh}
        />
      ) : null}

      {adding ? (
        <AddAccount
          currentWeek={data.currentWeek}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            void refresh();
          }}
        />
      ) : null}
    </>
  );
}

function AccountDrawer({
  account,
  currentWeek,
  touches,
  canEdit,
  isAdmin,
  onClose,
  onChanged,
}: {
  account: AbmAccountDto;
  currentWeek: string;
  touches: AbmScreenDto['touches'];
  canEdit: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const week = touches.find((t) => t.accountId === account.id && t.weekStart === currentWeek);
  const [emails, setEmails] = useState(String(week?.emails ?? 0));
  const [messages, setMessages] = useState(String(week?.messages ?? 0));
  const [calls, setCalls] = useState(String(week?.calls ?? 0));
  const [notes, setNotes] = useState(account.notes ?? '');

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/abm/${account.id}`, body),
    onSuccess: () => {
      setError(null);
      toast.show('Account updated');
      onChanged();
    },
    onError: (problem) =>
      setError(problem instanceof ApiProblem ? problem.text : 'That could not be saved'),
  });

  const saveTouches = useMutation({
    mutationFn: () =>
      api.put(`/abm/${account.id}/touches/${currentWeek}`, {
        emails: Number(emails) || 0,
        messages: Number(messages) || 0,
        calls: Number(calls) || 0,
      }),
    onSuccess: () => {
      toast.show('Touches saved');
      onChanged();
    },
  });

  return (
    <Drawer open onClose={onClose} title={account.name}>
      <div className="row wrap">
        <Pill tone={account.isLive ? 'good' : 'warn'}>{account.stage}</Pill>
        <Pill>{account.vertical}</Pill>
        <Pill>{account.region}</Pill>
        <Pill>{account.ownerName}</Pill>
        <Pill>{formatWeek(account.plannedWeek)}</Pill>
      </div>

      {canEdit ? (
        <div className="field">
          <label htmlFor="abm-stage">Stage</label>
          <select
            id="abm-stage"
            className="select"
            value={account.stage}
            onChange={(event) => patch.mutate({ stage: event.target.value as AbmStage })}
          >
            {ABM_STAGES.map((stage) => (
              <option key={stage}>{stage}</option>
            ))}
          </select>
          <span className="hint">
            Moving to Live, Engaged or Meeting booked records the time it went live.
          </span>
        </div>
      ) : null}

      {canEdit ? (
        <div className="field">
          <label htmlFor="abm-notes">Notes</label>
          <textarea
            id="abm-notes"
            className="textarea"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => {
              if (notes !== (account.notes ?? '')) patch.mutate({ notes });
            }}
          />
        </div>
      ) : account.notes ? (
        <p className="small muted">{account.notes}</p>
      ) : null}

      <div className="stack" style={{ gap: 6 }}>
        <h3>Links</h3>
        {(
          [
            ['researchUrl', 'Research'],
            ['deckUrl', 'Deck'],
            ['landingUrl', 'Landing page'],
          ] as const
        ).map(([key, label]) => (
          <div className="between small" key={key}>
            <span className="muted">{label}</span>
            {account[key] ? (
              <a href={account[key]!} target="_blank" rel="noopener noreferrer">
                Open
              </a>
            ) : (
              <span className="faint">Not set</span>
            )}
          </div>
        ))}
      </div>

      {canEdit ? (
        <>
          <hr className="divider" />
          <h3>Touches this week</h3>
          <div className="row" style={{ gap: 8 }}>
            {(
              [
                ['Emails', emails, setEmails],
                ['Messages', messages, setMessages],
                ['Calls', calls, setCalls],
              ] as const
            ).map(([label, value, set]) => (
              <div className="field" key={label} style={{ flex: 1 }}>
                <label htmlFor={`touch-${label}`}>{label}</label>
                <input
                  id={`touch-${label}`}
                  className="input num"
                  type="number"
                  min={0}
                  value={value}
                  onChange={(event) => set(event.target.value)}
                />
              </div>
            ))}
          </div>
          <Button onClick={() => saveTouches.mutate()} disabled={saveTouches.isPending}>
            Save touches
          </Button>
        </>
      ) : null}

      {isAdmin ? (
        <p className="xs faint">
          Only an admin can change the name, vertical, region, owner or launch week.
        </p>
      ) : null}

      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </Drawer>
  );
}

function AddAccount({
  currentWeek,
  onClose,
  onAdded,
}: {
  currentWeek: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState('');
  const [vertical, setVertical] = useState<Vertical>('Yallo Talent');
  const [region, setRegion] = useState<Region>('UAE');
  const [ownerId, setOwnerId] = useState('');
  const [plannedWeek, setPlannedWeek] = useState(currentWeek);
  const [error, setError] = useState<string | null>(null);

  const { data: people } = useQuery({
    queryKey: ['people'],
    queryFn: () => api.get<{ people: Profile[] }>('/people'),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/abm', { name, vertical, region, ownerId, plannedWeek, stage: 'Research' }),
    onSuccess: onAdded,
    onError: (problem) =>
      setError(problem instanceof ApiProblem ? problem.text : 'That account could not be added'),
  });

  const owners = (people?.people ?? []).filter((p) => p.active && p.role !== 'viewer');

  return (
    <Modal
      open
      onClose={onClose}
      title="Add an ABM account"
      footer={
        <Button
          tone="primary"
          disabled={name.trim() === '' || ownerId === '' || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? 'Adding…' : 'Add the account'}
        </Button>
      }
    >
      <div className="field">
        <label htmlFor="abm-name">Account name</label>
        <input
          id="abm-name"
          className="input"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="abm-vertical">Vertical</label>
        <select
          id="abm-vertical"
          className="select"
          value={vertical}
          onChange={(event) => setVertical(event.target.value as Vertical)}
        >
          {VERTICALS.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="abm-region">Region</label>
        <select
          id="abm-region"
          className="select"
          value={region}
          onChange={(event) => setRegion(event.target.value as Region)}
        >
          {REGIONS.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="abm-owner">Owner</label>
        <select
          id="abm-owner"
          className="select"
          value={ownerId}
          onChange={(event) => setOwnerId(event.target.value)}
        >
          <option value="">Choose a person</option>
          {owners.map((person) => (
            <option key={person.id} value={person.id}>
              {person.fullName}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="abm-week">Launch week (a Monday)</label>
        <input
          id="abm-week"
          className="input"
          type="date"
          value={plannedWeek}
          onChange={(event) => setPlannedWeek(event.target.value)}
        />
      </div>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </Modal>
  );
}
