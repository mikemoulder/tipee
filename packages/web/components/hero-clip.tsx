'use client'

import { useEffect, useState } from 'react'

/**
 * The hero backdrop — a black-and-white POV ride, behind frosted white glass.
 *
 * ## What this is and is not
 *
 * `ASSETS.md` rules out stock photography, and that still holds. This is not
 * that. It carries no claim about the product: nobody in it is using Tipee, no
 * screen in it is ours, and it is not standing in for a screenshot nobody has
 * taken yet. It sets a tempo. That is why it is `aria-hidden`, and why the page
 * is unchanged if it never loads.
 *
 * ## Why frosted, and not just faded
 *
 * The type over this is black on a white page, which is the whole brief, and
 * the footage underneath runs from blown-out sky to near-black road inside a
 * single frame. A flat opacity fade leaves those dark patches dark, and a green
 * headline word that happens to land on one drops to roughly 2.7:1.
 *
 * The blur is what fixes that, not the white. Blurring the backdrop destroys
 * the local contrast that makes patches, so what sits behind the text becomes
 * close to a single mid-tone that the white veil then lifts predictably.
 *
 * `backdrop-filter` is the one part of this that can be unsupported. It
 * degrades safely: without it the veil is still an 85–95% white wash over the
 * type column and the text stays legible, just over a sharper picture.
 *
 * ## Reduced motion is a branch, not a CSS rule
 *
 * There is no way to stop `autoPlay` from a stylesheet. A `prefers-reduced-
 * motion` query can hide a playing video but it cannot keep it from playing, so
 * a reader who asked for stillness would still pay for the decode, the battery
 * and — on a vestibular disorder — the motion itself if it were ever revealed.
 * So the choice happens in JavaScript and renders a different element.
 *
 * The first render is always the still. Reading `matchMedia` during render
 * would disagree with the server, and starting with the video and swapping it
 * out means the reader who asked for no motion gets motion for one frame, which
 * is exactly the reader who should not.
 */
export function HeroClip() {
  const [motionOk, setMotionOk] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setMotionOk(!query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {motionOk ? (
        <video
          className="h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          /* `metadata`, not `auto`: at 2.4 MB this should not race the fold. */
          preload="metadata"
          poster="/clips/hero-poster.jpg"
        >
          <source src="/clips/hero.mp4" type="video/mp4" />
        </video>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element -- the poster is
           already sized and compressed for this exact box; routing it through
           the image optimiser would re-encode a frame of the video it is a
           still of, for no gain. */
        <img src="/clips/hero-poster.jpg" alt="" className="h-full w-full object-cover" />
      )}

      {/*
       * The frosted pane, in two layers — and the split is the whole trick.
       *
       * One flat frosted sheet across the hero was the obvious build and it was
       * wrong: strong enough to carry black type on the left, it also turned
       * the right-hand two-thirds into grey mush, and a backdrop nobody can
       * identify as a motorcycle is worse than no backdrop at all.
       *
       * So the blur is masked. It is full strength under the type column and
       * gone by 72% across, which leaves the bike and the road sharp in the
       * half of the frame where nothing is written. `mask-image` clips the
       * element and its backdrop-filter together, so this costs one extra div
       * and no JavaScript.
       */}
      <div className="absolute inset-0 backdrop-blur-[7px] sm:[mask-image:linear-gradient(to_right,black_0%,black_60%,transparent_84%)]" />

      {/*
       * The white. Two gradings, and the breakpoint is not cosmetic.
       *
       * Wide, the veil is graded left to right: heavy under the type column,
       * thin on the right where nothing is written and the bike is the point.
       * The stops are set by a contrast floor rather than by eye — the body
       * copy is `text-muted` at 18px and needs 4.5:1, and against the darkest
       * frame this clip can put underneath, 86% white measures 4.87:1 while 80%
       * measures 4.1:1. So it holds >=86% all the way across the column and
       * only then falls away.
       *
       * On a phone that same grading is a bug, and it shipped as one for a
       * build: the type column *is* the full width there, so the thin right-
       * hand end of the veil sits under the tail of every wrapped line, and
       * "worth nothing anywhere else" ran straight across the bike. Narrow, the
       * veil is therefore near-flat and the blur is unmasked — there is no
       * text-free region to protect, so there is nothing to grade toward.
       */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.93)_0%,rgba(255,255,255,0.90)_100%)] sm:bg-[linear-gradient(to_right,rgba(255,255,255,0.95)_0%,rgba(255,255,255,0.90)_45%,rgba(255,255,255,0.86)_66%,rgba(255,255,255,0.30)_88%,rgba(255,255,255,0.18)_100%)]" />

      {/*
       * Top and bottom melt into the page. The nav above and the next section
       * below are both solid white, and without these the backdrop announces
       * itself as a rectangle with two hard grey rules across it.
       */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-white via-white/80 to-transparent" />
    </div>
  )
}
