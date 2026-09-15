'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * The clock behind the product demos.
 *
 * These are the site's "videos", and they are not videos. A recording of the
 * extension would be a few megabytes, would be soft on a retina display, would
 * go stale the moment a button changes, and could not be built at all until
 * somebody sat down and recorded one. Rebuilding the same sequence as real
 * markup costs nothing to ship, stays sharp at any density, and is authored
 * from the same tokens as the product it depicts, so it cannot drift far.
 *
 * What a real recording still buys is proof — that this exists and runs. That
 * is what the screenshot slots in components/media.tsx are for, and why these
 * demos live behind a component boundary that a real clip can replace.
 *
 * Three rules this hook exists to enforce:
 *
 *   - Nothing animates off-screen. An `IntersectionObserver` holds the timeline
 *     at its first frame until the demo is actually visible, so a page with
 *     four of these is not burning a phone battery on three the reader cannot
 *     see, and so a demo is never half-finished when it scrolls into view.
 *   - Nothing animates in a background tab. `visibilitychange` parks it.
 *   - Nothing animates for a reader who asked it not to. Under
 *     `prefers-reduced-motion` the timeline never advances and pins to
 *     `staticStep` — the frame that shows the most about the product, which is
 *     usually the outcome rather than the opening.
 */
export type DemoStep<T extends string> = {
  name: T
  /** How long this frame holds, in ms, before the next one. */
  ms: number
}

export type DemoTimeline<T extends string> = {
  /** Attach to the demo's outermost element so visibility can be observed. */
  ref: (node: HTMLElement | null) => void
  /** The frame currently showing. */
  step: T
  index: number
  /** True once the reader has seen it at least once — used to skip entry animations on replay. */
  looped: boolean
  /** Motion is off: either the reader asked, or the demo is parked. */
  frozen: boolean
  /** Jump the timeline, for a "replay" affordance. */
  goTo: (name: T) => void
}

export function useDemoTimeline<T extends string>(
  steps: readonly DemoStep<T>[],
  options: {
    /** The frame to pin under `prefers-reduced-motion`. Defaults to the last. */
    staticStep?: T
    /** Fraction of the demo that must be on screen before it plays. */
    threshold?: number
  } = {},
): DemoTimeline<T> {
  const { staticStep, threshold = 0.35 } = options

  const [index, setIndex] = useState(0)
  const [looped, setLooped] = useState(false)
  const [visible, setVisible] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [tabVisible, setTabVisible] = useState(true)

  // Held in a ref as well as state because the observer callback needs the
  // element identity across renders without re-subscribing every time a frame
  // advances — which would reset the observer 40 times a loop.
  const nodeRef = useRef<HTMLElement | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const ref = (node: HTMLElement | null) => {
    if (nodeRef.current === node) return
    if (observerRef.current && nodeRef.current) observerRef.current.unobserve(nodeRef.current)
    nodeRef.current = node
    if (observerRef.current && node) observerRef.current.observe(node)
  }

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    const sync = () => setTabVisible(document.visibilityState === 'visible')
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setVisible(entry.isIntersecting)
      },
      { threshold },
    )
    observerRef.current = observer
    if (nodeRef.current) observer.observe(nodeRef.current)
    return () => {
      observer.disconnect()
      observerRef.current = null
    }
  }, [threshold])

  const frozen = reduced || !visible || !tabVisible

  useEffect(() => {
    if (frozen) return
    const current = steps[index]
    if (!current) return

    const timer = window.setTimeout(() => {
      setIndex((previous) => {
        const next = previous + 1
        if (next >= steps.length) {
          setLooped(true)
          return 0
        }
        return next
      })
    }, current.ms)

    return () => window.clearTimeout(timer)
  }, [frozen, index, steps])

  // A demo that scrolled away mid-sequence should not scroll back holding a
  // stale middle frame — it reads as broken. Rewind while parked, but only for
  // visibility, never for reduced motion, which wants its pinned frame.
  useEffect(() => {
    if (!visible && !reduced) setIndex(0)
  }, [visible, reduced])

  const pinnedIndex = staticStep ? steps.findIndex((step) => step.name === staticStep) : -1
  const resolvedIndex = reduced ? (pinnedIndex >= 0 ? pinnedIndex : steps.length - 1) : index
  const resolved = steps[resolvedIndex] ?? steps[0]

  return {
    ref,
    step: resolved!.name,
    index: resolvedIndex,
    looped,
    frozen,
    goTo: (name: T) => {
      const next = steps.findIndex((step) => step.name === name)
      if (next >= 0) setIndex(next)
    },
  }
}

/**
 * Where a frame sits relative to the one showing.
 *
 * Demos need this constantly — "has the composer opened yet", "is the PIN
 * screen still ahead" — and comparing raw indices at every call site is how a
 * sequence ends up with one panel a frame out of step with another.
 */
export function phase<T extends string>(
  steps: readonly DemoStep<T>[],
  current: T,
  target: T,
): 'before' | 'now' | 'after' {
  const a = steps.findIndex((step) => step.name === current)
  const b = steps.findIndex((step) => step.name === target)
  if (a === b) return 'now'
  return a < b ? 'before' : 'after'
}

/** True once the timeline has reached `target` — the common case of `phase`. */
export function reached<T extends string>(
  steps: readonly DemoStep<T>[],
  current: T,
  target: T,
): boolean {
  return phase(steps, current, target) !== 'before'
}
