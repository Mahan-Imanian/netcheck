export function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="nc-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--nc-accent)" />
          <stop offset="1" stopColor="var(--nc-accent-2)" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="13" fill="none" stroke="url(#nc-logo)" strokeOpacity="0.35" strokeWidth="2" />
      <path d="M16 16 L16 3 A13 13 0 0 1 28.4 12.1 Z" fill="url(#nc-logo)" opacity="0.9" />
      <circle cx="16" cy="16" r="3.2" fill="var(--nc-accent)" />
    </svg>
  );
}
