import type { Metadata } from 'next'

import { ArrowLink, Button, Container, Eyebrow, Section } from '@/components/primitives'
import { RELEASE_URL, RELEASE_ZIP } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Add Tipee to Chrome',
  description: 'Download the Tipee extension, load it in Chrome, and get a wallet with 10 test USDC in about a minute.',
}

const STEPS = [
  {
    title: 'Download and unzip',
    body: 'Unzip it anywhere you like. There is nothing to configure.',
  },
  {
    title: 'Open chrome://extensions',
    body: 'Switch on Developer mode, top right. The Load unpacked button only appears once it is on.',
  },
  {
    title: 'Load unpacked',
    body: 'Choose the unzipped folder itself, not a file inside it. Tipee appears in your toolbar.',
  },
  {
    title: 'Set a PIN and tip',
    body: 'Click the Tipee icon and pick a PIN. Your wallet is ready with 10 test USDC in about ten seconds. Open any video and press the gift beside Like.',
  },
]

export default function InstallPage() {
  return (
    <>
      <section className="pt-12 pb-[calc(var(--section-y)*0.6)] sm:pt-20">
        <Container>
          <div className="flex max-w-[720px] flex-col">
            <Eyebrow>Install</Eyebrow>
            <h1 className="t-display-l mt-5">Add Tipee to Chrome in about a minute.</h1>
            <p className="t-lead mt-5 max-w-[52ch]">
              Tipee isn’t in the Chrome Web Store yet. Until it is, you load it the way every extension is tested before
              it ships: download, unzip, load unpacked. It works in Chrome, Edge and Brave.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-4">
              <Button href={RELEASE_ZIP} size="lg">
                Download the extension
              </Button>
              <ArrowLink href={RELEASE_URL}>Release notes</ArrowLink>
            </div>
            <p className="mt-6 font-mono text-[12.5px] text-fg-mute">A test version: the dollars in it are play money.</p>
          </div>
        </Container>
      </section>

      <Section space="tight" className="pt-0">
        <Container>
          <ol className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex flex-col border-t border-fg pt-5">
                <span className="font-mono text-[12px] text-fg-faint">0{index + 1}</span>
                <p className="t-title mt-3">{step.title}</p>
                <p className="t-small mt-2 text-fg-mute">{step.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

    </>
  )
}
