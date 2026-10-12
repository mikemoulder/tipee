import { ArrowLink, Container, Section, SectionHead } from '../primitives'
import { Reveal } from '../motion'
import { GITHUB_URL, RECEIPTS } from '@/lib/site'

const POINTS = [
  {
    title: 'Sending costs you nothing',
    body: 'Tipee pays the network fee on every tip, so a $1 tip arrives as $1.',
  },
  {
    title: 'The money is never ours',
    body: 'Tips are held by a public program on Stellar, not in a Tipee bank account. Only the verified channel owner can collect.',
  },
  {
    title: 'Every tip has a receipt',
    body: 'Each one is recorded on Stellar, where anyone can look it up.',
  },
]

/** Why Stellar, for a viewer or a creator. The technical version lives in the README. */
export function OnStellar() {
  return (
    <Section id="stellar" tone="surface">
      <Container className="grid gap-12 lg:grid-cols-12 lg:gap-10">
        <Reveal className="lg:col-span-5">
          <SectionHead
            eyebrow="Built on Stellar"
            title="Fast, nearly free, and checkable by anyone."
            lead="Tips settle in about five seconds on Stellar, a payments network built for small amounts."
            className="mb-8"
          />
          <div className="flex flex-col items-start gap-3">
            <ArrowLink href={RECEIPTS[0].url}>See a real tip on Stellar</ArrowLink>
            <ArrowLink href={`${GITHUB_URL}#how-stellar-is-used`}>How it’s built, for developers</ArrowLink>
          </div>
        </Reveal>
        <Reveal delay={80} className="lg:col-span-6 lg:col-start-7">
          <ul className="border-t border-fg">
            {POINTS.map((point) => (
              <li key={point.title} className="flex flex-col gap-1.5 border-b border-line-strong py-6">
                <p className="t-title">{point.title}</p>
                <p className="t-small text-fg-mute">{point.body}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </Section>
  )
}
