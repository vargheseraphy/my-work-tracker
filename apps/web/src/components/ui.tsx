/**
 * The small, shared pieces from docs/DESIGN.md "Components". Class names match the prototypes,
 * so the look comes from styles/components.css rather than from anything invented here.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PACE_WORD, type PaceLevel } from '@gtm/shared';

export type Tone = 'good' | 'bad' | 'warn' | 'info' | 'plain';

const toneClass = (tone: Tone): string => (tone === 'plain' ? '' : tone);

// ---------- card ----------
export function Card({
  children,
  tight,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  tight?: boolean;
  className?: string;
  as?: 'div' | 'section';
}) {
  return (
    <Tag className={`card${tight ? ' tight' : ''}${className ? ` ${className}` : ''}`}>
      {children}
    </Tag>
  );
}

export function CardHead({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="card-head">
      <h2>{title}</h2>
      {actions ?? (sub ? <span className="sub">{sub}</span> : null)}
    </div>
  );
}

// ---------- page head ----------
export function PageHead({
  eyebrow,
  title,
  actions,
}: {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div className="titles">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      {actions}
    </div>
  );
}

// ---------- stat card ----------
export function StatCard({
  kicker,
  stat,
  note,
  action,
}: {
  kicker: string;
  stat: string;
  note?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card stack">
      <span className="kicker">{kicker}</span>
      <span className="stat">{stat}</span>
      {note ? <span className="small muted">{note}</span> : null}
      {action}
    </div>
  );
}

// ---------- pill ----------
export function Pill({ tone = 'plain', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pill ${toneClass(tone)}`.trim()}>{children}</span>;
}

// ---------- pace dot ----------
const DOT_CLASS: Record<PaceLevel, string> = { good: 'g', warn: 'a', bad: 'r', none: 'w' };

/** The dot and the word together, so status is never shown by colour alone. */
export function PaceDot({ level, word }: { level: PaceLevel; word?: string }) {
  return (
    <span className="row" style={{ gap: 6 }}>
      <i className={`dot ${DOT_CLASS[level]}`} aria-hidden="true" />
      <span className="xs muted">{word ?? PACE_WORD[level]}</span>
    </span>
  );
}

// ---------- banner ----------
const BANNER_ICON: Record<Exclude<Tone, 'plain'>, string> = {
  bad: '#A83A28',
  good: '#2B6E45',
  warn: '#7A5200',
  info: '#34465A',
};

export function Banner({
  tone,
  title,
  body,
  action,
  role = 'status',
}: {
  tone: Exclude<Tone, 'plain'>;
  title: string;
  body?: string;
  action?: ReactNode;
  role?: 'status' | 'alert';
}) {
  return (
    <div className={`banner ${tone}`} role={role}>
      <div className="msg">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke={BANNER_ICON[tone]}
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6" />
          <path d="M12 16.5v.5" />
        </svg>
        <div>
          <b>{title}</b>
          {body ? <span>{body}</span> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

// ---------- progress bar ----------
export function Bar({ share, tone }: { share: number; tone?: 'gold' | 'behind' | 'good' }) {
  const percent = Math.max(0, Math.min(100, Math.round(share * 100)));
  return (
    <div className="bar">
      <i className={tone ?? ''} style={{ width: `${percent}%` }} />
    </div>
  );
}

// ---------- segmented control ----------
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ---------- buttons ----------
type ButtonTone = 'primary' | 'default' | 'ghost' | 'dashed' | 'ok';

const BUTTON_CLASS: Record<ButtonTone, string> = {
  primary: 'btn btn-primary',
  default: 'btn',
  ghost: 'btn btn-ghost',
  dashed: 'btn btn-dashed',
  ok: 'btn btn-ok',
};

export function Button({
  tone = 'default',
  small,
  block,
  children,
  ...rest
}: {
  tone?: ButtonTone;
  small?: boolean;
  block?: boolean;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const className = [BUTTON_CLASS[tone], small ? 'btn-sm' : '', block ? 'btn-block' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" {...rest} className={className}>
      {children}
    </button>
  );
}

export function LinkButton({
  to,
  tone = 'default',
  small,
  children,
}: {
  to: string;
  tone?: ButtonTone;
  small?: boolean;
  children: ReactNode;
}) {
  const className = [BUTTON_CLASS[tone], small ? 'btn-sm' : ''].filter(Boolean).join(' ');
  return (
    <Link className={className} to={to}>
      {children}
    </Link>
  );
}

// ---------- empty and loading ----------
export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Loading({ what = 'Loading' }: { what?: string }) {
  return (
    <div className="empty row" style={{ justifyContent: 'center' }}>
      <span className="spinner" aria-hidden="true" />
      <span>{what}…</span>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="err-text" role="alert">
      {children}
    </p>
  );
}

// ---------- toggle ----------
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <span className="switch">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i aria-hidden="true" />
    </span>
  );
}
