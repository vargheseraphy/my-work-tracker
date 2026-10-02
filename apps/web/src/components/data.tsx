/** DataTable, DayTabs, ComplianceGrid and the impressions chart. */

import type { ReactNode } from 'react';
import {
  COMPLIANCE_LABEL,
  formatDayShort,
  formatNumber,
  type ComplianceDto,
  type ComplianceStatus,
  type IsoDate,
} from '@gtm/shared';
import { Scrollable } from './ui.jsx';

// ---------- table ----------
export interface Column<T> {
  key: string;
  head: string;
  numeric?: boolean;
  render: (row: T) => ReactNode;
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  empty = 'Nothing here yet.',
  onRowClick,
}: {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: string;
  onRowClick?: (row: T) => void;
}) {
  if (rows.length === 0) return <p className="empty">{empty}</p>;

  return (
    <Scrollable label={caption}>
      <table className="table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.numeric ? 'num' : undefined} scope="col">
                {column.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
            >
              {columns.map((column) => (
                <td key={column.key} className={column.numeric ? 'num' : undefined}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Scrollable>
  );
}

// ---------- day tabs ----------
export interface DayTab {
  day: IsoDate;
  note: string;
}

export function DayTabs({
  days,
  selected,
  onSelect,
}: {
  days: DayTab[];
  selected: IsoDate;
  onSelect: (day: IsoDate) => void;
}) {
  if (days.length <= 1) return null;
  return (
    <div className="daytabs" role="tablist" aria-label="Choose a day">
      {days.map((tab) => (
        <button
          key={tab.day}
          type="button"
          role="tab"
          className="daytab"
          aria-selected={tab.day === selected}
          onClick={() => onSelect(tab.day)}
        >
          <b>{formatDayShort(tab.day)}</b>
          <span className="muted">{tab.note}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- compliance grid ----------
const CELL_CLASS: Record<ComplianceStatus, string> = {
  submitted: 'sub',
  late: 'late',
  missing: 'miss',
  due: 'fut',
  holiday: 'hol',
  leave: 'hol',
  off: 'off',
  future: 'fut',
};

const CELL_MARK: Record<ComplianceStatus, string> = {
  submitted: '✓',
  late: 'L',
  missing: '✕',
  due: '·',
  holiday: 'H',
  leave: 'A',
  off: '',
  future: '',
};

export function ComplianceGrid({ data }: { data: ComplianceDto }) {
  const columns = `minmax(110px, 160px) repeat(${data.days.length}, minmax(0, 1fr))`;

  return (
    <div className="stack">
      <Scrollable label={`Daily sign-off for ${data.month}`}>
        <div className="cgrid" style={{ gridTemplateColumns: columns, minWidth: 720 }}>
          <div className="c hd" />
          {data.days.map((day) => (
            <div className="c hd" key={day}>
              {day.slice(8)}
            </div>
          ))}

          {data.people.map((person) => (
            <Row key={person.userId} person={person} days={data.days} />
          ))}
        </div>
      </Scrollable>

      <div className="legend">
        <span>
          <i style={{ background: '#CFE6D7' }} /> Submitted
        </span>
        <span>
          <i style={{ background: '#F6E2A8' }} /> Late
        </span>
        <span>
          <i style={{ background: '#F2C3B8' }} /> Missing
        </span>
        <span>
          <i style={{ background: 'var(--info-bg)' }} /> Holiday or leave
        </span>
        <span>
          <i style={{ background: '#EFEFEB' }} /> Non-working day
        </span>
      </div>
    </div>
  );
}

function Row({
  person,
  days,
}: {
  person: ComplianceDto['people'][number];
  days: IsoDate[];
}) {
  return (
    <>
      <div className="small" style={{ paddingRight: 8 }}>
        <b>{person.fullName}</b>
        <span className="xs faint" style={{ display: 'block' }}>
          {person.submitted + person.late} of {person.expected} days
        </span>
      </div>
      {days.map((day) => {
        const cell = person.cells.find((c) => c.day === day);
        const status: ComplianceStatus = cell?.status ?? 'future';
        return (
          <div
            key={day}
            className={`c ${CELL_CLASS[status]}`}
            title={`${person.fullName}, ${formatDayShort(day)}: ${COMPLIANCE_LABEL[status]}`}
          >
            <span className="sr-only">{`${formatDayShort(day)}: ${COMPLIANCE_LABEL[status]}`}</span>
            <span aria-hidden="true">{CELL_MARK[status]}</span>
          </div>
        );
      })}
    </>
  );
}

// ---------- impressions chart ----------
export function ImpressionsChart({ points }: { points: { week: IsoDate; total: number }[] }) {
  const width = 640;
  const height = 180;
  const padding = { top: 12, right: 12, bottom: 26, left: 44 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const max = Math.max(1, ...points.map((p) => p.total));
  const step = points.length > 1 ? innerWidth / (points.length - 1) : 0;

  const x = (index: number) => padding.left + index * step;
  const y = (value: number) => padding.top + innerHeight - (value / max) * innerHeight;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.total)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${padding.top + innerHeight} L${padding.left},${padding.top + innerHeight} Z`;

  const total = points.reduce((sum, p) => sum + p.total, 0);

  return (
    <figure style={{ margin: 0 }}>
      <svg
        className="chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Impressions over ${points.length} weeks, ${formatNumber(total)} in total. The highest week is ${formatNumber(max)}.`}
      >
        <line
          className="axis"
          x1={padding.left}
          y1={padding.top + innerHeight}
          x2={width - padding.right}
          y2={padding.top + innerHeight}
        />
        <line
          className="axis"
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={padding.top + innerHeight}
        />
        {points.length > 1 ? <path className="area" d={area} /> : null}
        {points.length > 1 ? <path className="line" d={line} /> : null}
        {points.map((p, i) => (
          <circle key={p.week} className="pt" cx={x(i)} cy={y(p.total)} r={3} />
        ))}
        <text x={padding.left - 8} y={padding.top + 4} textAnchor="end">
          {formatNumber(max)}
        </text>
        <text x={padding.left - 8} y={padding.top + innerHeight + 4} textAnchor="end">
          0
        </text>
        {points.map((p, i) =>
          i % 2 === 0 ? (
            <text key={p.week} x={x(i)} y={height - 8} textAnchor="middle">
              {p.week.slice(5)}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="xs faint">
        Impressions a week, last {points.length} weeks. Highest: {formatNumber(max)}.
      </figcaption>
    </figure>
  );
}
