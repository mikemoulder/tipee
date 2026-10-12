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
            lead="Viewers tip on the video. The contract holds the money. The creator turns up whenever they like."
          />
        </Reveal>
        <Reveal delay={80}>
          <RuledColumns
            items={[
              {
                label: '01 · Tip',
                title: 'Click the gift beside Like',
                body: 'Pick an amount, leave a note, confirm with your PIN. Your wallet is an OpenZeppelin smart account the extension sets up in about ten seconds, and Tipee’s relayer pays every network fee.',
              },
              {
                label: '02 · Held',
                title: 'The contract keeps it under the channel ID',
                body: 'escrow.tip records the USDC against the YouTube channel ID, not a wallet. The creator needs no account, no wallet, and no idea Tipee exists.',
              },
              {
                label: '03 · Claimed',
                title: 'The creator proves it and is paid',
                body: 'A one-hour code in the channel description proves ownership. The contract pays 96% to any Stellar address and 4% to the treasury, in one transaction.',
              },
            ]}
          />
        </Reveal>
      </Container>
    </Section>
  )
}
