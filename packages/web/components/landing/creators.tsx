import { Container, Section, SectionHead } from '../primitives'
import { ChannelLookup } from './channel-lookup'

/** The page's one inverted band: the creator's moment, and a live read of the contract. */
export function Creators() {
  return (
    <Section id="creators" tone="dark">
      <Container>
        <SectionHead
          align="center"
          eyebrow="For creators"
          title="Someone may have tipped you already."
          lead="Type your channel. The balance comes straight from the escrow contract on Stellar testnet, right now."
        />
        <ChannelLookup />
      </Container>
    </Section>
  )
}
