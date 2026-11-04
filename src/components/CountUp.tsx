import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

export function CountUp({ value, digits = 0, duration = 0.45 }: { value: number | null | undefined; digits?: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const write = (v: number) => {
      el.textContent = v.toFixed(digits);
    };
    if (value == null) {
      el.textContent = "—";
      shown.current = null;
      return;
    }
    const start = shown.current ?? 0;
    if (reduce || start === value) {
      write(value);
      shown.current = value;
      return;
    }
    const controls = animate(start, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        shown.current = v;
        write(v);
      },
    });
    return () => controls.stop();
  }, [value, digits, duration, reduce]);

  return <span ref={ref} aria-label={value == null ? "no value" : value.toFixed(digits)} />;
}
