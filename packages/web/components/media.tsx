import Image from 'next/image'

/**
 * Slots for owner-supplied artwork.
 *
 * The site is built to be finished *without* these. Every claim it makes is
 * carried by the live demos in components/demo, which need no asset pipeline
 * and cannot go stale. That is deliberate: a landing page whose hero is an
 * empty grey rectangle until someone finds time to take a screenshot is a page
 * that ships late or ships broken.
 *
 * What a real photograph or screen recording adds is *evidence* — proof the
 * thing exists outside its own marketing. So these slots are additive. Drop a
 * file into `public/shots/` with the name in ASSETS.md and it appears; leave it
 * out and a designed placeholder states what belongs there, which reads as a
 * work in progress rather than a bug.
 *
 * `src` is deliberately optional and typed as such, so adding an asset is
 * never a code change beyond passing the path.
 */
export function Shot({
  src,
  alt,
  width,
  height,
  spec,
  className = '',
  priority = false,
}: {
  /** Path under /public, e.g. `/shots/gift-button.png`. Omit until it exists. */
  src?: string
  alt: string
  width: number
  height: number
  /** What belongs here, shown in the placeholder. Written for whoever supplies it. */
  spec: string
  className?: string
  priority?: boolean
}) {
  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        className={`h-auto w-full rounded-lg border border-rule shadow-float ${className}`}
      />
    )
  }

  return (
    <div
      role="img"
      aria-label={`Placeholder: ${spec}`}
      style={{ aspectRatio: `${width} / ${height}` }}
      className={`flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-rule bg-tint p-8 text-center ${className}`}
    >
      <span className="grid size-10 place-items-center rounded-pill bg-butter/40 text-ink">
        <CameraGlyph />
      </span>
      <p className="m-0 max-w-[36ch] text-[13px] leading-relaxed text-muted">{spec}</p>
      <p className="m-0 font-mono text-[11px] text-faint">
        {width} × {height}
      </p>
    </div>
  )
}

/**
 * A slot for a real screen recording.
 *
 * The demos are the site's motion today. If a clip of the extension running on
 * a real watch page ever gets recorded, it goes here and replaces the
 * re-creation beside it — same footprint, no layout change. Muted, looping and
 * `playsInline` because it is illustration, not content: it must never take
 * over the page or make noise at somebody's desk. `poster` matters more than
 * usual since autoplay is routinely blocked and a black rectangle is worse than
 * no video at all.
 */
export function Clip({
  src,
  poster,
  label,
  width,
  height,
  className = '',
}: {
  /** Path under /public, e.g. `/clips/tip.mp4`. */
  src: string
  poster?: string
  label: string
  width: number
  height: number
  className?: string
}) {
  return (
    <video
      src={src}
      poster={poster}
      width={width}
      height={height}
      aria-label={label}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      className={`h-auto w-full rounded-lg border border-rule shadow-float ${className}`}
    />
  )
}

function CameraGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.2a2 2 0 0 0 1.7-.95l.6-1.1A2 2 0 0 1 10.7 3h2.6a2 2 0 0 1 1.7.95l.6 1.1A2 2 0 0 0 17.3 6h1.2A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="13" r="3.6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}
