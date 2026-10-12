import { Container, RuledColumns, Section, SectionHead } from '../primitives'
import { Reveal } from '../motion'

export function How() {
  return (
    <Section id="how">
      <Container>
        <Reveal>
          <SectionHead
            eyebrow="How it works"
            title="Three steps, and only the last one needs the creator."
            lead="Viewers tip on the video. The tip waits safely. The creator collects whenever they like."
          />
        </Reveal>
        <Reveal delay={80}>
          <RuledColumns
            items={[
              {
                label: '01 · Tip',
                title: 'Click the gift beside Like',
                body: 'Pick an amount, add a note, confirm with your PIN. Setting up your wallet takes about ten seconds, and Tipee pays every fee.',
              },
              {
                label: '02 · Held',
                title: 'It waits for the creator',
                body: 'The tip is held for the channel itself, so the creator doesn’t need an account, a wallet, or to have heard of Tipee yet.',
              },
              {
                label: '03 · Claimed',
                title: 'The creator claims it',
                body: 'They paste a short code into their channel description to prove it’s theirs, and the money is theirs in seconds. They keep 96%.',
              },
            ]}
          />
        </Reveal>
      </Container>
    </Section>
  )
}
