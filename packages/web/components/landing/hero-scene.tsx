'use client'

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'

import { GiftGlyph } from '../brand'
import { Photo } from '../photo'
import { useInView, useReducedMotion } from '../motion'
import { cx } from '../primitives'
import { useCountTo } from './tip-stage'

/**
 * The hero: a creator mid-recording, with Tipee's real pieces floating at
 * different depths around them. The gift row from under the video, a tip
 * that just arrived (a viewer's face and note), and the total waiting for a
 * channel that has not signed up. The scene tilts with the pointer and the
 * cards drift; a new tip lands every few seconds.
 *
 * Photos live in /public/people (Unsplash or Pexels, free licence). Until a
 * file exists the frame shows a quiet stand-in, so nothing ever renders broken.
 * The channel is invented on purpose: a real creator beside a tip button reads
 * as an endorsement nobody gave.
 */

const CHANNEL = { handle: '@miracodes', initials: 'MO' }

const TIPS = [
  { name: 'Leo', face: '/people/face-1.jpg', amount: 5, note: 'This fixed my build at 2am' },
  { name: 'Sam', face: '/people/face-2.jpg', amount: 10, note: 'For the next video' },
  { name: 'Marcus', face: '/people/face-3.jpg', amount: 2, note: 'Best explanation on YouTube' },
  { name: 'Tunde', face: '/people/face-4.jpg', amount: 25, note: 'Saved me a week, honestly' },
  { name: 'Erik', face: '/people/face-5.jpg', amount: 1, note: 'Keep them coming' },
]

const START = 41.5

export function HeroScene({ className }: { className?: string }) {
  const reduced = useReducedMotion()
  const [ref, visible] = useInView<HTMLDivElement>({ threshold: 0.1, rootMargin: '0px', once: false })
  const [count, setCount] = useState(1)
  const rig = useRef<HTMLDivElement>(null)
  const frame = useRef(0)

  // A new tip every few seconds while the scene is on screen.
  useEffect(() => {
    if (reduced || !visible) return
    const timer = window.setInterval(() => setCount((n) => (n >= 30 ? 1 : n + 1)), 3600)
    return () => window.clearInterval(timer)
  }, [reduced, visible])

  const tip = TIPS[(count - 1) % TIPS.length]!
  const total = START + Array.from({ length: count }, (_, i) => TIPS[i % TIPS.length]!.amount).reduce((a, b) => a + b, 0)
  const shown = useCountTo(total)

  function tilt(event: PointerEvent<HTMLDivElement>) {
    if (reduced || event.pointerType !== 'mouse' || !rig.current) return
    const box = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - box.left) / box.width - 0.5
    const y = (event.clientY - box.top) / box.height - 0.5
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      rig.current?.style.setProperty('--ry', `${(x * 12).toFixed(2)}deg`)
      rig.current?.style.setProperty('--rx', `${(-y * 9).toFixed(2)}deg`)
    })
  }

  function settle() {
    rig.current?.style.setProperty('--ry', '-6deg')
    rig.current?.style.setProperty('--rx', '3deg')
  }

  return (
    <div
      ref={ref}
      onPointerMove={tilt}
      onPointerLeave={settle}
      className={cx('hero-scene relative mx-auto w-full max-w-[600px]', className)}
      role="img"
      aria-label={`A creator recording a video. Around them: the Tipee gift button beside Like, a ${tip.amount} dollar tip from ${tip.name} saying “${tip.note}”, and ${shown.toFixed(2)} USDC waiting for ${CHANNEL.handle}, a channel not on Tipee yet.`}
    >
      <div ref={rig} className="hero-rig relative aspect-[6/6.4] w-full" aria-hidden>
        {/* The creator */}
        <div className="absolute top-0 right-0 h-[88%] w-[80%] overflow-hidden rounded-panel bg-surface-2 shadow-pop" style={depth(0)}>
          <Photo src="/people/creator.jpg" className="h-full w-full object-cover" fallback={<CreatorStandIn />} />
          <span className="absolute top-4 left-4 inline-flex items-center gap-2 rounded-chip bg-black/55 px-3 py-1.5 text-[12px] font-semibold text-white backdrop-blur-md">
            <span className="h-2 w-2 rounded-full bg-danger" /> Recording
          </span>
        </div>

        {/* Under the video: the gift beside Like */}
        <div className="absolute top-[18%] left-0 sm:top-[10%]" style={depth(70)}>
          <div className="drift-a flex items-center gap-2 rounded-chip bg-panel p-2 shadow-pop">
            <span className="flex h-9 items-center gap-1.5 rounded-chip bg-fill px-3 text-[13px] font-semibold">
              <ThumbIcon /> 3.1K
            </span>
            <span className="hidden h-9 items-center rounded-chip bg-fill px-3 text-[13px] font-semibold sm:flex">Share</span>
            <span className="relative grid h-9 w-9 place-items-center rounded-full bg-accent-soft text-on-accent-soft">
              <span className="gift-cue absolute inset-0 rounded-full" />
              <GiftGlyph className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </span>
          </div>
        </div>

        {/* A tip that just arrived */}
        <div className="absolute bottom-[32%] left-0 w-[min(300px,66%)] sm:bottom-[20%] sm:left-[-2%]" style={depth(110)}>
          <div className="drift-b">
            <div key={count} className="toast-in flex items-start gap-3 rounded-tile bg-panel p-4 shadow-pop">
              <Photo
                src={tip.face}
                className="h-10 w-10 shrink-0 rounded-full object-cover"
                fallback={
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-[14px] font-semibold text-fg-soft">
                    {tip.name[0]}
                  </span>
                }
              />
              <div className="min-w-0">
                <p className="text-[14px] leading-snug">
                  <span className="font-semibold">{tip.name}</span> sent{' '}
                  <span className="font-mono font-medium text-accent">${tip.amount.toFixed(2)}</span>
                </p>
                <p className="mt-1 truncate text-[13px] text-fg-mute">“{tip.note}”</p>
              </div>
            </div>
          </div>
        </div>

        {/* What is waiting for the channel */}
        <div className="absolute right-0 bottom-0 w-[min(250px,52%)] sm:right-[-3%]" style={depth(55)}>
          <div className="drift-c rounded-tile bg-panel p-4 shadow-pop sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="t-label whitespace-nowrap">Waiting for</span>
              <span className="hidden rounded-chip bg-fill px-2 py-0.5 text-[11px] whitespace-nowrap text-fg-mute sm:inline">not on Tipee yet</span>
            </div>
            <p className="mt-1.5 text-[14px] font-semibold">{CHANNEL.handle}</p>
            <p className="mt-2 font-mono text-[30px] leading-none font-medium tracking-[-0.03em] text-accent tabular-nums">
              {shown.toFixed(2)}
              <span className="ml-1 text-[12px] tracking-normal text-fg-mute">USDC</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function depth(z: number): CSSProperties {
  return { transform: `translateZ(${z}px)`, transformStyle: 'preserve-3d' }
}

function CreatorStandIn() {
  return (
    <div className="panel-atmos grid h-full w-full place-items-center">
      <div className="field" />
      <span className="grid h-28 w-28 place-items-center rounded-full bg-panel text-[36px] font-semibold text-fg-soft shadow-card">
        {CHANNEL.initials}
      </span>
    </div>
  )
}

function ThumbIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round">
      <path d="M7 10v10H4V10h3Zm0 0 4-7c1.3 0 2.2 1.1 2 2.4L12.5 9H19a2 2 0 0 1 2 2.3l-1.2 6.8A2.3 2.3 0 0 1 17.5 20H7" />
    </svg>
  )
}
