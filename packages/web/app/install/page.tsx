import { Reveal } from '@/components/reveal'
import { TestnetNotice } from '@/components/shared-sections'
import { Container, Eyebrow, Pill, Section, Steps } from '@/components/ui'

export const metadata = {
  title: 'Install Tipee',
  description: 'Add the Tipee extension to Chrome and set up your wallet in about a minute.',
}

/**
 * The install landing, and the target of every "Add to Chrome" on the site.
 *
 * The store listing does not exist yet, so this page is honest about that
 * rather than pointing at a dead Web Store URL — a broken install link is worse
 * than a page saying "not yet". The download is the GitHub release, built
 * against the live API, so nothing needs building; the commands are for anyone
 * who would rather build it themselves.
 */
const RELEASE_ZIP = 'https://github.com/mikemoulder/tipee/releases/latest/download/tipee-extension-0.3.0-stellar-testnet.zip'

const COMMANDS = [
  'git clone https://github.com/mikemoulder/tipee.git',
  'cd tipee && npm install',
  'VITE_TIPEE_API=https://tipee-api.duckdns.org npm run build -w @tipee/extension',
  '# then load packages/extension/dist',
]

export default function InstallPage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="aurora" aria-hidden="true" />
        <Container className="relative z-10 pt-16 pb-16 sm:pt-24 sm:pb-20">
          <div className="flex max-w-[720px] flex-col gap-7">
            <Eyebrow>Install</Eyebrow>
            <h1 className="m-0 text-hero font-extrabold text-balance">
              Not in the Chrome Web Store yet.
            </h1>
            <p className="prose-measure m-0 text-[18px] leading-relaxed text-muted">
              Tipee is still in development, so there is no one-click install to give you. It does
              run today — download it and load it unpacked, which takes about a minute and is how
              every Chrome extension is tested before it ships.
            </p>
            <a
              href={RELEASE_ZIP}
              className="inline-flex w-fit items-center gap-2 rounded-pill bg-forest px-6 py-3 text-[15px] font-bold text-on-forest no-underline transition-colors hover:bg-deep"
            >
              Download the extension (.zip)
            </a>
            <div className="flex flex-wrap gap-2">
              <Pill tone="mint">Chrome &amp; Edge · Manifest V3</Pill>
              <Pill tone="tint">Roughly one minute</Pill>
            </div>
            <TestnetNotice className="w-fit" />
          </div>
        </Container>
      </section>

      <Section
        tone="shell"
        eyebrow="Loading it unpacked"
        title="Four steps, once"
        lede="Everything below happens on your own machine. Nothing is uploaded and no account is created at any point."
      >
        <Steps
          items={[
            {
              title: 'Download and unzip',
              body: 'Download the zip above and unzip it anywhere. It is built and pointed at Tipee’s live testnet service, so there is nothing to configure.'
            },
            {
              title: 'Open the extensions page',
              body: 'Go to chrome://extensions and switch on Developer mode, top right. The toggle has to be on before the next step appears.',
            },
            {
              title: 'Load unpacked',
              body: 'Click "Load unpacked" and choose the unzipped folder — the folder itself, not a file inside it.',
            },
            {
              title: 'Set up the wallet',
              body: 'Open the extension, pick a PIN, and write the recovery phrase down. It asks you to confirm three words of it before letting you send anything, because nothing here is recoverable by us.',
            },
          ]}
        />

        <Reveal delay={120} className="mt-8">
          <div className="overflow-hidden rounded-md border border-rule bg-[#171f12] shadow-lift">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
              <span className="size-2.5 rounded-pill bg-[#ff5f57]" />
              <span className="size-2.5 rounded-pill bg-[#febc2e]" />
              <span className="size-2.5 rounded-pill bg-[#28c840]" />
              <span className="ml-2 font-mono text-[11px] text-white/40">or build it yourself</span>
            </div>
            <pre className="m-0 overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed text-mint">
              {COMMANDS.map((line) => (
                <div key={line}>
                  <span className="text-white/35 select-none">$ </span>
                  {line}
                </div>
              ))}
            </pre>
          </div>
        </Reveal>
      </Section>

      <Section tone="cream" eyebrow="Then" title="Open any video">
        <p className="prose-measure m-0 text-[15.5px] leading-relaxed text-muted">
          The gift button appears in the action bar beside Like. If it does not, reload the page —
          an extension that was installed or updated while a tab was already open cannot reach that
          tab until it refreshes.
        </p>
      </Section>
    </>
  )
}
