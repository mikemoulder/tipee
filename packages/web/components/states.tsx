"use client";
/* The five states: copy to src/components/states.tsx
 *
 * Every screen that can fetch, filter or submit needs all five. Judges find
 * them by accident (an empty search, a slow network, a bad input), and that
 * accident is where the polish score is decided.
 *
 * Styled only with the tokens in globals.css. Needs: npm i sonner, and
 * <Toaster /> from "./states" mounted once in the root layout.
 */
import type { ReactNode } from "react";
import { Toaster as Sonner } from "sonner";
import { Button } from "./primitives";

function Glyph({ kind }: { kind: "empty" | "error" }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden className="text-fg-mute">
      {kind === "empty" ? (
        <>
          <path d="M4 13.5 6.5 6h11l2.5 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M4 13.5h4.5l1 2h5l1-2H20V18H4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M12 7.5v5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="12" cy="16.25" r="0.9" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

/* ── 1. EMPTY ────────────────────────────────────────────────────────────────
 * Never a blank div and never "No data". What goes here, why it is empty,
 * and the action that fills it. */
export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-tile border border-dashed border-line-strong px-6 py-16 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-full bg-fill">{icon ?? <Glyph kind="empty" />}</div>
      <div className="flex flex-col gap-1.5">
        <p className="t-title">{title}</p>
        <p className="t-small mx-auto max-w-[44ch] text-fg-mute">{body}</p>
      </div>
      {action}
    </div>
  );
}

/* ── 2. LOADING ──────────────────────────────────────────────────────────────
 * A skeleton in the shape of the real content. Not a spinner. Over two
 * seconds, add a line saying what is happening ("Reading 240 filings"). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-tile border border-line bg-panel p-5">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}

export function LoadingGrid({ count = 6, label = "Loading" }: { count?: number; label?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-live="polite" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

/* ── 3. ERROR ────────────────────────────────────────────────────────────────
 * A sentence a person wrote, then the way out. Never a code or a stack
 * trace on a projector. */
export function ErrorState({
  title = "That did not load",
  body = "The request failed. This is usually temporary, so try again.",
  onRetry,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-4 rounded-tile bg-danger-soft px-6 py-12 text-center"
    >
      <span className="text-danger">
        <Glyph kind="error" />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="t-title">{title}</p>
        <p className="t-small mx-auto max-w-[44ch] text-fg-mute">{body}</p>
      </div>
      {onRetry ? (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/* ── 4. PARTIAL ──────────────────────────────────────────────────────────────
 * Render what arrived, skeleton the rest. A slow backend looks like a fast
 * one. */
export function PartialGrid<T>({
  items,
  expected,
  render,
}: {
  items: T[];
  expected: number;
  render: (item: T, i: number) => ReactNode;
}) {
  const missing = Math.max(0, expected - items.length);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(render)}
      {Array.from({ length: missing }, (_, i) => (
        <CardSkeleton key={`skeleton-${i}`} />
      ))}
    </div>
  );
}

/* ── 5. SUCCESS ──────────────────────────────────────────────────────────────
 * Confirm the action landed, in the past tense: "Payment sent." Silence
 * after a submit reads as a broken app. Mount <Toaster /> once. */
export { toast } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      toastOptions={{
        unstyled: false,
        className: "!rounded-tile !border !border-line !bg-panel !text-fg !shadow-pop !font-sans",
        descriptionClassName: "!text-fg-mute",
      }}
    />
  );
}

/* ── The switch ──────────────────────────────────────────────────────────────
 * One component that cannot forget a state, because the types will not let
 * it. */
export type Async<T> =
  | { status: "loading" }
  | { status: "error"; retry?: () => void }
  | { status: "empty" }
  | { status: "ready"; data: T };

export function AsyncBoundary<T>({
  state,
  empty,
  children,
  skeleton = <LoadingGrid />,
}: {
  state: Async<T>;
  empty: ReactNode;
  children: (data: T) => ReactNode;
  skeleton?: ReactNode;
}) {
  switch (state.status) {
    case "loading":
      return <>{skeleton}</>;
    case "error":
      return <ErrorState onRetry={state.retry} />;
    case "empty":
      return <>{empty}</>;
    case "ready":
      return <>{children(state.data)}</>;
  }
}
