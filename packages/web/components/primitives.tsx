/* Design-system primitives: copy to src/components/primitives.tsx
 *
 * Server components (no "use client"), styled only through the tokens in
 * globals.css. They exist because they repeat on every page, not because
 * every div deserves a name. If you need a one-off layout, write the div.
 *
 * Nothing here is decoration. Each primitive encodes a decision from
 * DESIGN.md: where content aligns, how a section breathes, which surface a
 * thing sits on, and which corner it gets.
 */
import Link from "next/link";
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ── Layout ─────────────────────────────────────────────────────────────── */

/** The alignment anchor. Every section's content snaps to this edge. */
export function Container({
  size = "page",
  className,
  children,
}: {
  size?: "page" | "text" | "prose";
  className?: string;
  children: ReactNode;
}) {
  const max = { page: "max-w-page", text: "max-w-text", prose: "max-w-prose" }[size];
  return <div className={cx("mx-auto w-full px-[var(--gutter)]", max, className)}>{children}</div>;
}

type Tone = "ground" | "surface" | "dark" | "light";

/**
 * A section of the page. `tone="dark"` scopes the dark tokens to this band on
 * a light page (and "light" does the reverse), so an inverted band is one prop,
 * not a second set of colors.
 */
export function Section({
  id,
  tone = "ground",
  space = "default",
  className,
  children,
  ...rest
}: {
  id?: string;
  tone?: Tone;
  space?: "default" | "tight" | "flush";
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<"section">, "className" | "children">) {
  const pad = {
    default: "py-[var(--section-y)]",
    tight: "py-[calc(var(--section-y)*0.6)]",
    flush: "",
  }[space];
  const toneClass = {
    ground: "",
    surface: "bg-surface",
    dark: "theme-dark bg-ground text-fg",
    light: "theme-light bg-ground text-fg",
  }[tone];
  return (
    <section id={id} className={cx("scroll-mt-24", pad, toneClass, className)} {...rest}>
      {children}
    </section>
  );
}

/* ── Type ───────────────────────────────────────────────────────────────── */

type HeadingSize = "xl" | "l" | "m" | "title";
const headingClass: Record<HeadingSize, string> = {
  xl: "t-display-xl",
  l: "t-display-l",
  m: "t-display-m",
  title: "t-title",
};

/** Level is for the outline, size is for the eye. Choose each on purpose. */
export function Heading({
  as: Tag = "h2",
  size = "l",
  className,
  children,
  ...rest
}: {
  as?: "h1" | "h2" | "h3" | "h4" | "p";
  size?: HeadingSize;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<"h2">, "className" | "children">) {
  return (
    <Tag className={cx(headingClass[size], className)} {...rest}>
      {children}
    </Tag>
  );
}

export function Eyebrow({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cx("t-label", className)}>{children}</p>;
}

export function Lead({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cx("t-lead max-w-[56ch]", className)}>{children}</p>;
}

/** The section opener: optional eyebrow, a claim, one sentence. Then var(--stack) of air. */
export function SectionHead({
  eyebrow,
  title,
  lead,
  align = "start",
  as = "h2",
  size = "l",
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  align?: "start" | "center";
  as?: "h1" | "h2" | "h3";
  size?: HeadingSize;
  className?: string;
}) {
  const center = align === "center";
  return (
    <div className={cx("mb-[var(--stack)]", center ? "mx-auto max-w-[900px] text-center" : "max-w-text", className)}>
      {eyebrow ? <Eyebrow className="mb-4">{eyebrow}</Eyebrow> : null}
      <Heading as={as} size={size}>
        {title}
      </Heading>
      {lead ? <Lead className={cx("mt-5", center && "mx-auto")}>{lead}</Lead> : null}
    </div>
  );
}

/* ── Actions ────────────────────────────────────────────────────────────── */

type ButtonVariant = "action" | "quiet" | "ghost" | "text" | "accent" | "danger";
type ButtonSize = "sm" | "md" | "lg";

function buttonClass(variant: ButtonVariant, size: ButtonSize, icon?: boolean, extra?: string) {
  return cx(
    "btn",
    `btn-${variant}`,
    size === "sm" && "btn-sm",
    size === "lg" && "btn-lg",
    icon && "btn-icon",
    extra,
  );
}

type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: boolean;
  busy?: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * Renders a Link for internal hrefs, an <a> for external ones and a <button>
 * otherwise. `busy` keeps the width and swaps the label for a spinner, so the
 * layout never jumps on submit.
 */
export function Button({
  href,
  variant = "action",
  size = "md",
  icon,
  busy,
  className,
  children,
  ...rest
}: ButtonProps & { href?: string } & Omit<ComponentPropsWithoutRef<"button">, "className" | "children">) {
  const cls = buttonClass(variant, size, icon, className);
  if (href) {
    const external = /^https?:\/\//.test(href);
    return external ? (
      <a href={href} className={cls} target="_blank" rel="noreferrer">
        {children}
      </a>
    ) : (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" {...rest} className={cls} aria-busy={busy || undefined} disabled={rest.disabled || busy}>
      {children}
    </button>
  );
}

/** Tertiary action: words and an arrow. */
export function ArrowLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const external = /^https?:\/\//.test(href);
  const inner = (
    <>
      {children}
      <span data-arrow aria-hidden>
        {external ? "↗" : "→"}
      </span>
    </>
  );
  return external ? (
    <a href={href} className={cx("arrow-link", className)} target="_blank" rel="noreferrer">
      {inner}
    </a>
  ) : (
    <Link href={href} className={cx("arrow-link", className)}>
      {inner}
    </Link>
  );
}

/* ── Surfaces ───────────────────────────────────────────────────────────────
 * Four kinds, chosen by what the content is (references/components.md has
 * the decision tree). Most content needs none of them: open text on the
 * ground, or ruled columns, beats a box almost every time.
 *
 *   tile     a flat block one step off the ground. no border, no shadow
 *   card     an object you can act on. hairline, card shadow
 *   panel    a stage: holds a product shot, a field, a demo
 *   feature  a large closing card (CTA pairs)
 */
type SurfaceKind = "tile" | "card" | "panel" | "feature";
const surfaceClass: Record<SurfaceKind, string> = {
  tile: "bg-tile rounded-tile",
  card: "bg-panel rounded-tile border border-line shadow-card",
  panel: "panel-atmos bg-surface rounded-panel",
  feature: "bg-tile rounded-feature",
};

export function Surface<T extends ElementType = "div">({
  as,
  kind = "tile",
  className,
  children,
  ...rest
}: {
  as?: T;
  kind?: SurfaceKind;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">) {
  const Tag = (as ?? "div") as ElementType;
  // A bg-* in className replaces the kind's default ground (a tile on accent-soft,
  // a panel on surface-2). Without this the default can win the cascade silently.
  const base = /(^|\s)bg-/.test(className ?? "")
    ? surfaceClass[kind].replace(/(^|\s)bg-\S+/g, "")
    : surfaceClass[kind];
  return (
    <Tag className={cx(base, className)} {...rest}>
      {children}
    </Tag>
  );
}

/* ── Open content patterns ──────────────────────────────────────────────── */

export type RuledItem = {
  label?: string;
  title: ReactNode;
  body?: ReactNode;
  href?: string;
  cta?: string;
};

/**
 * Columns with a rule on top instead of a box around them. The single most
 * useful replacement for a row of identical cards.
 */
export function RuledColumns({
  items,
  cols = 3,
  strong = true,
  className,
}: {
  items: RuledItem[];
  cols?: 2 | 3 | 4;
  strong?: boolean;
  className?: string;
}) {
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return (
    <ul className={cx("grid gap-x-6 gap-y-10", grid, className)}>
      {items.map((item, i) => (
        <li key={i} className={cx("flex flex-col border-t pt-5", strong ? "border-fg" : "border-line-strong")}>
          {item.label ? <p className="t-label mb-3">{item.label}</p> : null}
          <p className="t-title">{item.title}</p>
          {item.body ? <p className="t-small mt-2 max-w-[38ch] text-fg-mute">{item.body}</p> : null}
          {item.href ? (
            <ArrowLink href={item.href} className="mt-auto pt-4">
              {item.cta ?? "Read more"}
            </ArrowLink>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** A real number with a rule above it. Never a number nobody measured. */
export function Stat({ value, label, className }: { value: ReactNode; label: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-4 border-t border-line-strong pt-6", className)}>
      <dt className="t-small order-2 max-w-[34ch] text-fg-mute">{label}</dt>
      <dd className="t-num order-1 m-0 text-[clamp(40px,4vw,54px)] leading-[1.1] tracking-[-0.04em]">{value}</dd>
    </div>
  );
}

export function StatRow({ stats, className }: { stats: Array<{ value: ReactNode; label: ReactNode }>; className?: string }) {
  return (
    <dl className={cx("grid gap-x-6 gap-y-8 sm:grid-cols-3", className)}>
      {stats.map((s, i) => (
        <Stat key={i} value={s.value} label={s.label} />
      ))}
    </dl>
  );
}

/** Index rows: a list that wants to be scanned, not a grid of cards. */
export function Rows({
  items,
  className,
}: {
  items: Array<{ title: ReactNode; detail?: ReactNode; meta?: ReactNode; href?: string }>;
  className?: string;
}) {
  return (
    <ul className={cx("border-y border-line", className)}>
      {items.map((row, i) => {
        const inner = (
          <>
            <span className="t-body min-w-0 flex-1 truncate">{row.title}</span>
            {row.detail ? <span className="t-small hidden flex-1 text-fg-mute sm:block">{row.detail}</span> : null}
            {row.meta ? <span className="t-small t-num text-fg-mute">{row.meta}</span> : null}
          </>
        );
        return (
          <li key={i} className="border-b border-line last:border-b-0">
            {row.href ? (
              <Link
                href={row.href}
                className="-mx-3 flex items-center gap-6 rounded-[10px] px-3 py-4 transition-colors duration-150 hover:bg-fill"
              >
                {inner}
              </Link>
            ) : (
              <div className="flex items-center gap-6 py-4">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ── Product frames ─────────────────────────────────────────────────────────
 * Real UI is the best imagery a product has. Frame it lightly: a phone with a
 * white bezel or a browser with a quiet bar. Never a fake screenshot. */
export function Frame({
  kind = "browser",
  label,
  className,
  children,
}: {
  kind?: "phone" | "browser";
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  if (kind === "phone") {
    return (
      <div
        className={cx("relative w-[312px] max-w-full overflow-hidden rounded-[44px] bg-panel shadow-frame", className)}
        role="group"
        aria-label={label}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      className={cx("overflow-hidden rounded-panel border border-line bg-panel shadow-pop", className)}
      role="group"
      aria-label={label}
    >
      <div className="flex h-10 items-center gap-3 border-b border-line px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-fill-strong" aria-hidden />
        {label ? <span className="t-small truncate text-fg-faint">{label}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** Status chip. Semantic color, never the accent, and only where state is real. */
export function Status({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  children: ReactNode;
}) {
  const cls = {
    neutral: "bg-fill text-fg-soft",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    accent: "bg-accent-soft text-on-accent-soft",
  }[tone];
  return (
    <span className={cx("inline-flex h-6 items-center gap-1.5 rounded-chip px-2.5 text-[12px] font-medium", cls)}>
      {tone !== "neutral" ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}
