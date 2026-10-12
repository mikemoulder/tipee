"use client";
/* Motion primitives: copy to src/components/motion.tsx
 *
 * Built on CSS and IntersectionObserver, not an animation library, so they
 * cost almost nothing and degrade to a fully visible page. The rules they
 * enforce (references/motion.md):
 *
 *   - Content is visible by default. Hiding for a reveal only happens once
 *     JS is running, and MOTION_BOOT shows everything if hydration fails.
 *   - Everything reveals once. Nothing re-animates on scroll back.
 *   - Reduced motion gets the final state, instantly.
 *   - Loops pause when offscreen.
 *
 * Wire-up, once, in src/app/layout.tsx:
 *
 *   import { MOTION_BOOT, MotionRoot } from "@/components/motion";
 *   <html lang="en" suppressHydrationWarning>
 *     <head><script dangerouslySetInnerHTML={{ __html: MOTION_BOOT }} /></head>
 *     <body><MotionRoot />{children}</body>
 *   </html>
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";

/** Runs before paint: marks JS as available, and unhides everything after
 *  3s if React never hydrated (a crashed bundle must not leave a blank page). */
export const MOTION_BOOT = `(function(){var d=document.documentElement;d.classList.add('js');setTimeout(function(){if(!d.hasAttribute('data-hydrated'))d.classList.add('reveal-all')},3000)})();`;

export function MotionRoot() {
  useEffect(() => {
    document.documentElement.setAttribute("data-hydrated", "");
  }, []);
  return null;
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** True once the element has been seen. With `once: false` it tracks visibility. */
export function useInView<T extends Element>(
  opts: { threshold?: number; rootMargin?: string; once?: boolean } = {},
): [RefObject<T | null>, boolean] {
  const { threshold = 0.15, rootMargin = "0px 0px -40px 0px", once = true } = opts;
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, rootMargin, once]);
  return [ref, inView];
}

/**
 * Fade and rise once, when scrolled into view. Use on section content, not
 * on every element: a page where everything moves reads as a template.
 * `delay` in ms staggers siblings; keep the step at 60ms and cap at 8 items.
 */
export function Reveal({
  as: Tag = "div",
  delay = 0,
  className,
  children,
}: {
  as?: "div" | "li" | "section" | "article" | "figure";
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <Tag
      ref={ref as RefObject<never>}
      data-reveal=""
      data-in={inView ? "" : undefined}
      className={className}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}

/**
 * SVG line art that draws itself in. Give each path class="draw" and
 * pathLength={1}; stagger with style={{ "--d": "0.2s" }}.
 */
export function LineArt({
  className,
  viewBox,
  label,
  children,
}: {
  className?: string;
  viewBox: string;
  label: string;
  children: ReactNode;
}) {
  const [ref, inView] = useInView<SVGSVGElement>({ threshold: 0.3 });
  return (
    <svg
      ref={ref}
      viewBox={viewBox}
      className={className}
      role="img"
      aria-label={label}
      data-armed=""
      data-in={inView ? "" : undefined}
      fill="none"
    >
      {children}
    </svg>
  );
}

/**
 * Sets data-paused while offscreen, so CSS loops (marquees, signature
 * streams, drifting fields) stop costing frames nobody sees.
 */
export function PauseOffscreen({
  className,
  children,
  ...rest
}: {
  className?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0, rootMargin: "0px", once: false });
  return (
    <div ref={ref} className={className} data-paused={inView ? undefined : ""} {...rest}>
      {children}
    </div>
  );
}

/** A strip of words (features, chains, standards), never a wall of fake logos. */
export function Marquee({
  items,
  seconds = 40,
  className,
  itemClassName = "px-10 text-[18px] tracking-[-0.02em] text-fg-faint whitespace-nowrap",
  label,
}: {
  items: string[];
  seconds?: number;
  className?: string;
  itemClassName?: string;
  label: string;
}) {
  return (
    <PauseOffscreen className={["marquee", className].filter(Boolean).join(" ")} role="region" aria-label={label}>
      <div className="marquee-track" style={{ "--marquee-dur": `${seconds}s` } as CSSProperties}>
        {[0, 1].map((copy) => (
          <ul key={copy} className="flex" aria-hidden={copy === 1 || undefined}>
            {items.map((t) => (
              <li key={t} className={itemClassName}>
                {t}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </PauseOffscreen>
  );
}

/**
 * Counts up to a real number when first seen. The one delight moment for a
 * money shot that is a number. Renders the final value on the server, so
 * there is never a flash of zero for crawlers or reduced motion.
 */
export function CountUp({
  value,
  duration = 900,
  format = (n: number) => Math.round(n).toLocaleString("en-US"),
  className,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLSpanElement>({ threshold: 0.6 });
  const reduced = useReducedMotion();
  const [shown, setShown] = useState<number | null>(null);
  // Below the fold, reset to zero before it is seen. Above the fold it would
  // flash, so keep CountUp for numbers the visitor scrolls to.
  useEffect(() => {
    if (reduced) setShown(null);
    else if (!inView) setShown(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);
  useEffect(() => {
    if (!inView || reduced) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, value, duration]);
  return (
    <span ref={ref} className={["t-num", className].filter(Boolean).join(" ")}>
      {format(shown ?? value)}
    </span>
  );
}
