/* A wireframe terrain, generated rather than drawn.

   Deterministic on purpose: the height field is a sum of three sines, so the
   server and the client produce byte-identical paths and React never complains
   about a hydration mismatch. No canvas, no animation loop, no image request —
   it is a few kilobytes of SVG path data. */

const ROWS = 24;
const COLS = 46;
const W = 1200;
const H = 420;

/** Sum of sines. Cheap, smooth, and repeatable across a server/client boundary
 *  in a way that any seeded PRNG would also be, but with fewer moving parts. */
function height(x: number, y: number) {
  return (
    Math.sin(x * 0.34 + 0.6) * Math.cos(y * 0.42) * 1.0 +
    Math.sin(x * 0.13 + y * 0.23) * 1.7 +
    Math.sin(x * 0.81 + 1.2) * 0.35 +
    Math.cos(y * 0.17 + x * 0.05) * 0.9
  );
}

function rows() {
  const out: { d: string; t: number }[] = [];
  for (let r = 0; r < ROWS; r++) {
    const t = r / (ROWS - 1);          // 0 = far, 1 = near
    const depth = Math.pow(t, 1.85);   // perspective compression
    const baseY = 40 + depth * (H - 60);
    const amp = 10 + depth * 52;       // nearer ridges are taller
    const spread = 0.34 + depth * 0.66;
    const pts: string[] = [];
    for (let c = 0; c <= COLS; c++) {
      const u = c / COLS;
      const x = W / 2 + (u - 0.5) * W * spread;
      const y = baseY - height(c * 0.5, r * 0.6) * amp * 0.5;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    out.push({ d: `M${pts.join("L")}`, t });
  }
  return out;
}

const ROW_DATA = rows();

/* A handful of points sitting above the mesh. They read as depth cues and
   cost four lines of code. */
const MOTES = Array.from({ length: 26 }, (_, i) => {
  const a = i * 2.399;
  return {
    x: W / 2 + Math.cos(a) * (120 + ((i * 53) % 470)),
    y: 60 + ((i * 97) % 320),
    r: 0.8 + ((i * 37) % 17) / 14,
    o: 0.12 + ((i * 29) % 40) / 150,
  };
});

export function Terrain({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      fill="none"
      aria-hidden
      preserveAspectRatio="xMidYMax slice"
    >
      <defs>
        <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
          <stop offset="38%" stopColor="var(--accent)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--accent-2, var(--accent))" stopOpacity="0.9" />
        </linearGradient>
        <radialGradient id="tf" cx="50%" cy="82%" r="72%">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="62%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="tm">
          <rect width={W} height={H} fill="url(#tf)" />
        </mask>
      </defs>

      <g mask="url(#tm)">
        {ROW_DATA.map((row, i) => (
          <path
            key={i}
            d={row.d}
            stroke="url(#tg)"
            strokeWidth={0.35 + row.t * 0.9}
            strokeOpacity={0.14 + row.t * 0.46}
            strokeLinecap="round"
          />
        ))}
        {MOTES.map((m, i) => (
          <circle key={i} cx={m.x} cy={m.y} r={m.r} fill="var(--accent)" opacity={m.o} />
        ))}
      </g>
    </svg>
  );
}
