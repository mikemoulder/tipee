import { Container, Section, SectionHead } from '../primitives'
import { Reveal } from '../motion'
import { TipStage } from './tip-stage'

const STEPS = [
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
    body: 'They prove the channel is theirs once with a short code, then sign in with a passkey whenever they want to be paid. They keep 96%.',
  },
]

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
        <div className="grid items-start gap-12 lg:grid-cols-12 lg:gap-10">
          <Reveal className="lg:col-span-7">
            <TipStage />
          </Reveal>
          <Reveal delay={80} className="lg:col-span-5">
            <ol className="flex flex-col">
              {STEPS.map((step) => (
                <li key={step.label} className="flex flex-col border-t border-fg py-6 first:pt-5 last:pb-0">
                  <p className="t-label mb-3">{step.label}</p>
                  <p className="t-title">{step.title}</p>
                  <p className="t-small mt-2 max-w-[44ch] text-fg-mute">{step.body}</p>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}
