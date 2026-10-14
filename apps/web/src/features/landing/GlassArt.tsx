/**
 * The moving glass pieces behind the hero.
 *
 * Real SVG rather than blurred divs, so each shard has a proper glass build: a translucent fill,
 * a bright top edge, a specular highlight, and a soft inner shadow. They drift on long, offset
 * cycles so the composition never repeats visibly.
 *
 * All decoration: aria-hidden, pointer-events none, and every animation stops under
 * prefers-reduced-motion.
 */

export function GlassArt() {
  return (
    <div className="ga" aria-hidden="true">
      <svg className="ga-svg" viewBox="0 0 1200 760" preserveAspectRatio="xMidYMid slice">
        <defs>
          {/* One glass material, reused. Light from the top left, as everywhere else. */}
          <linearGradient id="ga-pane" x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity=".20" />
            <stop offset="45%" stopColor="#fff" stopOpacity=".06" />
            <stop offset="100%" stopColor="#fff" stopOpacity=".02" />
          </linearGradient>
          <linearGradient id="ga-edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity=".55" />
            <stop offset="50%" stopColor="#fff" stopOpacity=".12" />
            <stop offset="100%" stopColor="#fff" stopOpacity=".30" />
          </linearGradient>
          <linearGradient id="ga-spec" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity=".42" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="ga-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity=".55" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
          <filter id="ga-soft" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
        </defs>

        {/* The single colour moment: one violet bloom, nothing else tinted. */}
        <circle className="ga-bloom" cx="300" cy="180" r="260" fill="url(#ga-glow)" />
        <circle className="ga-bloom ga-bloom-2" cx="980" cy="520" r="200" fill="url(#ga-glow)" />

        {/* Far layer: large, slow, barely there. */}
        <g className="ga-l ga-far">
          <Pane x={86} y={96} w={210} h={140} r={18} rotate={-14} />
          <Pane x={930} y={430} w={190} h={128} r={16} rotate={11} />
        </g>

        {/* Middle layer: the readable shards. */}
        <g className="ga-l ga-mid">
          <Pane x={820} y={96} w={250} h={166} r={20} rotate={9} sheen />
          <Pane x={120} y={448} w={226} h={150} r={18} rotate={-8} sheen />
        </g>

        {/* Near layer: small, quicker, with a drawn sparkline inside. */}
        <g className="ga-l ga-near">
          <g transform="translate(690 560) rotate(-6)">
            <Pane x={0} y={0} w={240} h={120} r={16} sheen />
            <polyline
              className="ga-spark"
              points="24,88 68,62 104,74 146,38 190,52 216,22"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>

        {/* A slowly turning ring, for a second kind of motion. */}
        <g className="ga-ring" transform="translate(1000 180)">
          <circle r="78" fill="none" stroke="url(#ga-edge)" strokeWidth="1.5" />
          <circle
            r="78"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeDasharray="60 430"
            strokeLinecap="round"
            opacity=".85"
          />
          <circle r="54" fill="none" stroke="url(#ga-edge)" strokeWidth="1" opacity=".6" />
        </g>
      </svg>
    </div>
  );
}

/** One glass pane: body, bright edge, and an optional specular sweep across the top corner. */
function Pane({
  x,
  y,
  w,
  h,
  r,
  rotate = 0,
  sheen = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  rotate?: number;
  sheen?: boolean;
}) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return (
    <g transform={rotate ? `rotate(${rotate} ${cx} ${cy})` : undefined}>
      <rect x={x} y={y} width={w} height={h} rx={r} fill="url(#ga-pane)" />
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={r}
        fill="none"
        stroke="url(#ga-edge)"
        strokeWidth="1.25"
      />
      {sheen ? (
        <path
          d={`M${x + 14} ${y + h - 14} L${x + w * 0.52} ${y + 10} L${x + w * 0.74} ${y + 10} L${x + 36} ${y + h - 14} Z`}
          fill="url(#ga-spec)"
          opacity=".5"
        />
      ) : null}
    </g>
  );
}
