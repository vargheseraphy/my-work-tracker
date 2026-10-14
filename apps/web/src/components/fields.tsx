/**
 * The log form pieces: a number field that saves itself, a proof slot, and the progress panel.
 *
 * Autosave waits 600 ms after typing stops, retries three times, and keeps anything unsaved in
 * session storage so a refresh loses nothing (docs/DESIGN.md "Behaviour", DAY-02).
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import imageCompression from 'browser-image-compression';
import type { AttachmentDto, MetricDefinition } from '@gtm/shared';
import { api, ApiProblem } from '../api.js';
import { Button } from './ui.jsx';

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

const SAVE_WORD: Record<SaveState, string> = {
  idle: '',
  saving: 'Saving',
  saved: 'Saved',
  failed: 'Not saved',
};

/** Where an unsaved value waits out a refresh. */
function draftKey(entryId: string, metricKey: string, part: string): string {
  return `gtm:${entryId}:${metricKey}:${part}`;
}

function readDraft(entryId: string, metricKey: string, part: string): string | null {
  try {
    return sessionStorage.getItem(draftKey(entryId, metricKey, part));
  } catch {
    return null;
  }
}

function writeDraft(entryId: string, metricKey: string, part: string, value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(draftKey(entryId, metricKey, part));
    else sessionStorage.setItem(draftKey(entryId, metricKey, part), value);
  } catch {
    // Private browsing can refuse. The value is still in the form.
  }
}

interface SaveBody {
  numValue?: number | null;
  textValue?: string | null;
  note?: string | null;
}

/** Save one field, retrying up to three times before giving up. */
async function saveValue(entryId: string, metricKey: string, body: SaveBody): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await api.put(`/entries/${entryId}/values/${metricKey}`, body);
      return;
    } catch (error) {
      lastError = error;
      // A refusal will not become a success on a retry.
      if (error instanceof ApiProblem && error.status < 500) break;
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  throw lastError;
}

export function SaveStateLabel({ state }: { state: SaveState }) {
  return (
    <span className={`save-state ${state}`} aria-live="polite">
      {SAVE_WORD[state]}
    </span>
  );
}

// ---------- number field ----------
export function NumberField({
  entryId,
  field,
  initialValue,
  readOnly,
  onSaved,
}: {
  entryId: string;
  field: MetricDefinition;
  initialValue: number | null;
  readOnly: boolean;
  onSaved: (value: number | null) => void;
}) {
  const draft = readDraft(entryId, field.key, 'num');
  const [text, setText] = useState(draft ?? (initialValue === null ? '' : String(initialValue)));
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const inputId = `f-${field.key}`;

  const flush = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      const value = trimmed === '' ? null : Number(trimmed);
      if (value !== null && (Number.isNaN(value) || value < 0)) {
        setState('failed');
        return;
      }
      setState('saving');
      saveValue(entryId, field.key, { numValue: value })
        .then(() => {
          setState('saved');
          writeDraft(entryId, field.key, 'num', null);
          onSaved(value);
        })
        .catch(() => setState('failed'));
    },
    [entryId, field.key, onSaved],
  );

  const onChange = (raw: string) => {
    setText(raw);
    writeDraft(entryId, field.key, 'num', raw);
    setState('idle');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(raw), 600);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <>
      <label className="sr-only" htmlFor={inputId}>
        {field.label}
      </label>
      <input
        id={inputId}
        className={`input num${state === 'saved' ? ' ok' : ''}${state === 'failed' ? ' err' : ''}`}
        type="number"
        min={0}
        step={field.valueType === 'percent' ? 'any' : 1}
        max={field.valueType === 'percent' ? 100 : undefined}
        inputMode="numeric"
        value={text}
        readOnly={readOnly}
        disabled={readOnly}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          clearTimeout(timer.current);
          if (state === 'idle' && text !== (initialValue === null ? '' : String(initialValue))) {
            flush(text);
          }
        }}
      />
      <SaveStateLabel state={state} />
    </>
  );
}

// ---------- text field ----------
export function TextField({
  entryId,
  field,
  initialValue,
  readOnly,
  rows = 3,
  onSaved,
}: {
  entryId: string;
  field: MetricDefinition;
  initialValue: string | null;
  readOnly: boolean;
  rows?: number;
  onSaved: (value: string) => void;
}) {
  const draft = readDraft(entryId, field.key, 'text');
  const [text, setText] = useState(draft ?? initialValue ?? '');
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const inputId = `t-${field.key}`;

  const flush = useCallback(
    (raw: string) => {
      setState('saving');
      saveValue(entryId, field.key, { textValue: raw })
        .then(() => {
          setState('saved');
          writeDraft(entryId, field.key, 'text', null);
          onSaved(raw);
        })
        .catch(() => setState('failed'));
    },
    [entryId, field.key, onSaved],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="field">
      <label htmlFor={inputId}>{field.label}</label>
      <textarea
        id={inputId}
        className="textarea"
        rows={rows}
        maxLength={500}
        value={text}
        readOnly={readOnly}
        disabled={readOnly}
        onChange={(event) => {
          setText(event.target.value);
          writeDraft(entryId, field.key, 'text', event.target.value);
          setState('idle');
          clearTimeout(timer.current);
          timer.current = setTimeout(() => flush(event.target.value), 600);
        }}
      />
      <div className="between">
        <span className="hint">{500 - text.length} characters left</span>
        <SaveStateLabel state={state} />
      </div>
    </div>
  );
}

// ---------- link proof ----------
export function LinkField({
  entryId,
  field,
  initialValue,
  readOnly,
  onSaved,
}: {
  entryId: string;
  field: MetricDefinition;
  initialValue: string | null;
  readOnly: boolean;
  onSaved: (value: string) => void;
}) {
  const [text, setText] = useState(initialValue ?? '');
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const inputId = `l-${field.key}`;

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="row" style={{ gap: 8 }}>
      <label className="sr-only" htmlFor={inputId}>
        {field.label}: link
      </label>
      <input
        id={inputId}
        className={`input${state === 'saved' ? ' ok' : ''}`}
        type="url"
        placeholder="https://"
        value={text}
        readOnly={readOnly}
        disabled={readOnly}
        style={{ width: 200 }}
        onChange={(event) => {
          setText(event.target.value);
          setState('idle');
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            setState('saving');
            saveValue(entryId, field.key, { textValue: event.target.value })
              .then(() => {
                setState('saved');
                onSaved(event.target.value);
              })
              .catch(() => setState('failed'));
          }, 600);
        }}
      />
    </div>
  );
}

// ---------- note, for the spike rule ----------
export function NoteField({
  entryId,
  metricKey,
  initialValue,
  readOnly,
}: {
  entryId: string;
  metricKey: string;
  initialValue: string | null;
  readOnly: boolean;
}) {
  const [text, setText] = useState(initialValue ?? '');
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const inputId = `n-${metricKey}`;

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="field" style={{ marginBottom: 10 }}>
      <label className="hint" htmlFor={inputId}>
        Why was this so much higher than usual?
      </label>
      <input
        id={inputId}
        className={`input${state === 'saved' ? ' ok' : ''}`}
        value={text}
        maxLength={500}
        readOnly={readOnly}
        disabled={readOnly}
        onChange={(event) => {
          setText(event.target.value);
          setState('idle');
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            setState('saving');
            saveValue(entryId, metricKey, { note: event.target.value })
              .then(() => setState('saved'))
              .catch(() => setState('failed'));
          }, 600);
        }}
      />
    </div>
  );
}

// ---------- proof slot ----------
export function ProofSlot({
  entryId,
  metricKey,
  attachments,
  readOnly,
  onChanged,
}: {
  entryId: string;
  metricKey: string;
  attachments: AttachmentDto[];
  readOnly: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const mine = attachments.filter((a) => a.metricKey === metricKey);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      // Shrink images in the browser first, which also strips the location data (DAY-11).
      const toSend =
        file.type.startsWith('image/') && file.type !== 'image/gif'
          ? await imageCompression(file, {
              maxWidthOrHeight: 1600,
              initialQuality: 0.8,
              useWebWorker: true,
            })
          : file;

      const form = new FormData();
      form.append('metricKey', metricKey);
      form.append('file', toSend, file.name);
      await api.upload(`/entries/${entryId}/attachments`, form);
      onChanged();
    } catch (problem) {
      setError(problem instanceof ApiProblem ? problem.text : 'That file could not be attached');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await api.del(`/attachments/${id}`);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="proof-list">
      {mine.map((attachment) => (
        <span className="proof-file" key={attachment.id}>
          <a href={attachment.url} target="_blank" rel="noopener noreferrer">
            {attachment.fileName}
          </a>
          {readOnly ? null : (
            <Button
              small
              tone="ghost"
              disabled={busy}
              aria-label={`Remove ${attachment.fileName}`}
              onClick={() => {
                void remove(attachment.id);
              }}
            >
              Remove
            </Button>
          )}
        </span>
      ))}

      {readOnly || mine.length >= 5 ? null : (
        <>
          {/* Attachments are switched off for now (db/migrations/0012). The control stays on
              screen, pale and inert, so the feature is visibly "later" rather than missing. */}
          <span className="btn btn-sm proof-soon" aria-disabled="true" title="Coming later">
            Attach a screenshot
          </span>
          <span className="xs faint">Not yet available</span>
          <label className="btn btn-sm hidden" style={{ cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Attaching…' : mine.length > 0 ? 'Add another' : 'Attach a screenshot'}
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="sr-only"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
          </label>
          {error ? (
            <span className="err-text" role="alert">
              {error}
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}

// ---------- the side panel on a log ----------
export function ProgressAside({
  done,
  total,
  missing,
  errors,
  canSubmit,
  submitting,
  onSubmit,
  children,
}: {
  done: number;
  total: number;
  missing: string[];
  errors: string[];
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
  children?: ReactNode;
}) {
  const share = total === 0 ? 0 : done / total;
  return (
    <aside>
      <div className="card stack">
        <span className="kicker">Progress</span>
        <div className="between">
          <span className="stat">
            {done} of {total}
          </span>
          <span className="xs muted">fields answered</span>
        </div>
        <div className="bar">
          <i className="gold" style={{ width: `${Math.round(share * 100)}%` }} />
        </div>

        {missing.length > 0 ? (
          <div className="stack" style={{ gap: 6 }}>
            <b className="small">Still needed</b>
            <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
              {missing.slice(0, 8).map((label) => (
                <li key={label}>{label}</li>
              ))}
              {missing.length > 8 ? <li>and {missing.length - 8} more</li> : null}
            </ul>
          </div>
        ) : (
          <p className="small muted">Everything is filled in.</p>
        )}

        {errors.length > 0 ? (
          <div className="stack" style={{ gap: 6 }} role="alert">
            <b className="small" style={{ color: 'var(--bad)' }}>
              Fix these first
            </b>
            <ul className="small" style={{ margin: 0, paddingLeft: 18, color: 'var(--bad)' }}>
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <Button tone="primary" block disabled={!canSubmit || submitting} onClick={onSubmit}>
          {submitting ? 'Submitting…' : 'Submit'}
        </Button>
        {children}
      </div>
    </aside>
  );
}
