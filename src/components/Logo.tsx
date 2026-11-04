const BARS = [
  { x: 6.5, h: 6 },
  { x: 11.75, h: 10 },
  { x: 17, h: 14 },
  { x: 22.25, h: 18 },
];

export function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M7 0H32V25L25 32H0V7Z" fill="var(--nc-text)" />
      {BARS.map((b, i) => (
        <rect key={b.x} x={b.x} y={25.5 - b.h} width={3.6} height={b.h} fill={i === BARS.length - 1 ? "var(--nc-excellent)" : "var(--nc-bg)"} />
      ))}
    </svg>
  );
}
