import { Container, Section, SectionHead } from '../primitives'
import { Reveal } from '../motion'

const ROWS: Array<{ topic: string; them: string; us: string }> = [
  {
    topic: 'Who can be tipped',
    them: 'Channels accepted into the YouTube Partner Program',
    us: 'Any channel, from its first video',
  },
  {
    topic: 'Before the first tip',
    them: 'The creator applies, qualifies and switches it on',
    us: 'Nothing. The tip waits in escrow',
  },
  {
    topic: 'Taken from the tip',
    them: 'YouTube keeps 30%',
    us: '4%, and only when it is claimed',
  },
  {
    topic: 'Where it goes',
    them: 'AdSense, on its payout schedule',
    us: 'Any Stellar address, in one transaction',
  },
]

export function Contrast() {
  return (
    <Section>
      <Container>
        <Reveal>
          <SectionHead
            eyebrow="Why not Super Thanks"
            title="Super Thanks waits for the Partner Program. Tipee doesn’t."
            lead="Most channels can’t take a tip on YouTube at all. The ones that can give up nearly a third of it."
          />
        </Reveal>
        <Reveal delay={80}>
          <div className="overflow-hidden rounded-tile bg-tile shadow-card">
            <div className="hidden grid-cols-[1fr_1.2fr_1.2fr] gap-6 border-b border-line px-6 py-4 sm:grid">
              <span />
              <span className="t-label">Super Thanks</span>
              <span className="t-label text-fg">Tipee</span>
            </div>
            <dl>
              {ROWS.map((row) => (
                <div
                  key={row.topic}
                  className="grid gap-2 border-b border-line px-6 py-5 last:border-b-0 sm:grid-cols-[1fr_1.2fr_1.2fr] sm:gap-6"
                >
                  <dt className="t-small font-semibold">{row.topic}</dt>
                  <dd className="t-small m-0 text-fg-mute">
                    <span className="t-label mr-2 sm:hidden">Super Thanks</span>
                    {row.them}
                  </dd>
                  <dd className="t-small m-0 text-fg">
                    <span className="t-label mr-2 sm:hidden">Tipee</span>
                    {row.us}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
