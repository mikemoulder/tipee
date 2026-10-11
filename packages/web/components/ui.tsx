import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

/**
 * The gift mark.
 *
 * There is still no commissioned logo, so this is drawn from the one glyph the
 * product already has an opinion about: the gift icon on the button the
 * extension injects beside Like. A wordmark with no mark at all was the earlier
 * answer and it read as unfinished at page scale, where the nav has to hold its
 * own against a hero. This is deliberately simple enough to be replaced by a
 * real mark without anything around it moving.
 */
export function GiftMark({ className = '', size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <rect x="3" y="12" width="26" height="17" rx="4" className="fill-forest" />
      <rect x="2" y="8" width="28" height="8" rx="3" className="fill-leaf" />
      <rect x="13.5" y="8" width="5" height="21" className="fill-butter" />
      {/* The bow, as two loops — the detail that makes it read as a gift and
          not a parcel at 16px. */}
      <path
        d="M16 8C16 8 12.6 8 11.2 6.6C10.2 5.6 10.4 4 11.6 3.3C12.8 2.6 14.4 3.2 15.2 4.6L16 8Z"
        className="fill-butter"
      />
      <path
        d="M16 8C16 8 19.4 8 20.8 6.6C21.8 5.6 21.6 4 20.4 3.3C19.2 2.6 17.6 3.2 16.8 4.6L16 8Z"
        className="fill-butter"
      />
    </svg>
  )
}

export function Wordmark({
  className = '',
  markSize = 26,
}: {
  className?: string
  markSize?: number
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <GiftMark size={markSize} />
      {/* Anton, and no weight class. The face has one weight and it is already
          black; `font-extrabold` here would ask the browser to synthesise a
          bold on top of it, which smears the stems at nav size. */}
      <span className="font-display tracking-[-0.01em] lowercase">tipee</span>
    </span>
  )
}

/** The page's horizontal rhythm, set once so sections cannot disagree. */
export function Container({
  children,
  className = '',
  width = 'default',
}: {
  children: ReactNode
  className?: string
  /** `wide` for full-bleed demo bands; `narrow` for reading columns. */
  width?: 'default' | 'wide' | 'narrow'
}) {
  const max =
    width === 'wide' ? 'max-w-[1320px]' : width === 'narrow' ? 'max-w-[760px]' : 'max-w-[1160px]'
  return <div className={`mx-auto w-full ${max} px-5 sm:px-8 ${className}`}>{children}</div>
}

/**
 * `tone` is a prop and not something you pass through `className`, because the
 * two candidates are both `color` utilities: Tailwind settles that conflict by
 * stylesheet order rather than by the order the classes are written, so a
 * `text-muted` passed in from outside may silently lose to the `text-faint`
 * baked in here. The same trap is documented on the nav's Add-to-Chrome button.
 *
 * `muted` exists for the hero, where the eyebrow sits over the frosted clip
 * rather than plain white. Measured against the darkest frame of that clip,
 * `faint` lands at 3.43:1 and `muted` at 4.87:1 — and at 11.5px this is small
 * text, so 4.5:1 is the bar it has to clear.
 */
export function Eyebrow({
  children,
  className = '',
  tone = 'faint',
}: {
  children: ReactNode
  className?: string
  tone?: 'faint' | 'muted'
}) {
  return (
    <p
      className={`m-0 font-mono text-[11.5px] font-medium uppercase tracking-[0.16em] ${
        tone === 'muted' ? 'text-muted' : 'text-faint'
      } ${className}`}
    >
      {children}
    </p>
  )
}

export function Section({
  children,
  eyebrow,
  title,
  lede,
  id,
  tone = 'cream',
  align = 'left',
  className = '',
  width = 'default',
}: {
  children: ReactNode
  eyebrow?: string
  title?: ReactNode
  lede?: ReactNode
  /** Set when something links here, so the anchor has a target. */
  id?: string
  /** Alternating bands give the page rhythm without a rule on every seam. */
  tone?: 'cream' | 'tint' | 'shell' | 'deep'
  align?: 'left' | 'center'
  className?: string
  width?: 'default' | 'wide' | 'narrow'
}) {
  const tones = {
    cream: 'bg-cream text-ink',
    tint: 'bg-tint text-ink',
    shell: 'bg-shell text-ink',
    deep: 'bg-deep text-on-forest',
  } as const

  return (
    <section id={id} className={`${tones[tone]} py-20 sm:py-28 ${className}`}>
      <Container width={width}>
        {(eyebrow || title || lede) && (
          <div
            className={`mb-12 flex flex-col gap-4 ${
              align === 'center' ? 'items-center text-center' : 'max-w-[760px]'
            }`}
          >
            {eyebrow && <Eyebrow className={tone === 'deep' ? 'text-mint' : ''}>{eyebrow}</Eyebrow>}
            {title && (
              <h2 className="m-0 text-section font-extrabold text-balance">{title}</h2>
            )}
            {lede && (
              <p
                className={`m-0 text-[17px] leading-relaxed text-pretty ${
                  tone === 'deep' ? 'text-mint/80' : 'text-muted'
                } ${align === 'center' ? 'max-w-[62ch]' : 'prose-measure'}`}
              >
                {lede}
              </p>
            )}
          </div>
        )}
        {children}
      </Container>
    </section>
  )
}

export function Card({
  children,
  className = '',
  tone = 'card',
}: {
  children: ReactNode
  className?: string
  tone?: 'card' | 'tint' | 'mint' | 'butter'
}) {
  const tones = {
    card: 'bg-card border-rule',
    tint: 'bg-tint border-rule',
    mint: 'bg-mint border-leaf/30',
    butter: 'bg-butter border-butter',
  } as const

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border ${tones[tone]} p-6 shadow-soft sm:p-7 ${className}`}
    >
      {children}
    </div>
  )
}

/** Talise's corner ticks. Reserved for the two or three things that matter most. */
export function Bracket({
  children,
  tone = 'forest',
  className = '',
}: {
  children: ReactNode
  tone?: 'forest' | 'butter'
  className?: string
}) {
  return (
    <div className={`bracket ${tone === 'butter' ? 'bracket-butter' : ''} ${className}`}>
      {children}
    </div>
  )
}

type Tone = 'primary' | 'secondary' | 'ghost' | 'butter'
type Size = 'md' | 'lg'

const tones: Record<Tone, string> = {
  primary: 'bg-forest text-on-forest hover:bg-deep shadow-lift',
  secondary: 'bg-card text-ink border border-rule hover:border-forest hover:text-forest shadow-soft',
  ghost: 'text-ink hover:bg-tint',
  butter: 'bg-butter text-ink hover:bg-[#ffc721] shadow-lift',
}

const sizes: Record<Size, string> = {
  md: 'px-5 py-3 text-[14px]',
  lg: 'px-7 py-4 text-[15px]',
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-pill font-semibold no-underline transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:pointer-events-none disabled:opacity-50'

export function ButtonLink({
  href,
  tone = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: {
  href: string
  tone?: Tone
  size?: Size
  className?: string
  children: ReactNode
} & Omit<ComponentProps<typeof Link>, 'href' | 'children' | 'className'>) {
  return (
    <Link href={href} className={`${base} ${tones[tone]} ${sizes[size]} ${className}`} {...rest}>
      {children}
    </Link>
  )
}

export function Button({
  tone = 'primary',
  size = 'md',
  className = '',
  ...rest
}: { tone?: Tone; size?: Size } & ComponentProps<'button'>) {
  return <button className={`${base} ${tones[tone]} ${sizes[size]} ${className}`} {...rest} />
}

/** A small rounded label. Used for the testnet notice and inline metadata. */
export function Pill({
  children,
  tone = 'tint',
  className = '',
}: {
  children: ReactNode
  tone?: 'tint' | 'mint' | 'butter' | 'outline'
  className?: string
}) {
  const tones = {
    tint: 'bg-tint text-muted border-rule',
    mint: 'bg-mint text-deep border-leaf/30',
    butter: 'bg-butter/35 text-ink border-butter',
    outline: 'bg-transparent text-muted border-rule',
  } as const

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-pill border px-3.5 py-1.5 text-[12.5px] font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

/**
 * Numbered steps.
 *
 * The number is set large and in the accent rather than as a small superscript:
 * at page scale the sequence is the point, and a 10px "01" does not carry it.
 */
export function Steps({
  items,
}: {
  items: { title: string; body: string; art?: ReactNode }[]
}) {
  return (
    <ol className="m-0 grid list-none grid-cols-1 gap-5 p-0 md:grid-cols-3">
      {items.map((item, index) => (
        <li
          key={item.title}
          className="flex flex-col gap-4 rounded-lg border border-rule bg-card p-7 shadow-soft"
        >
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-pill bg-mint font-mono text-[15px] font-semibold text-deep">
              {index + 1}
            </span>
            {item.art}
          </div>
          <h3 className="m-0 text-[19px] font-bold tracking-[-0.02em]">{item.title}</h3>
          <p className="m-0 text-[14.5px] leading-relaxed text-muted">{item.body}</p>
        </li>
      ))}
    </ol>
  )
}
