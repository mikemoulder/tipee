import { ArrowLink, Container, Section, SectionHead } from '../primitives'
import { Reveal } from '../motion'
import {
  ESCROW_CONTRACT_ID,
  ESCROW_URL,
  RECEIPTS,
  SMART_ACCOUNT_KIT_URL,
  USDC_CONTRACT_ID,
  USDC_URL,
  short,
} from '@/lib/site'

const PARTS: Array<{ name: string; does: string; ref: string; href: string }> = [
  {
    name: 'Escrow contract',
    does: 'Soroban. tip(), claim() and balance() keyed by YouTube channel ID. Only the verifier key can release a claim',
    ref: short(ESCROW_CONTRACT_ID),
    href: ESCROW_URL,
  },
  {
    name: 'Gifter wallets',
    does: 'OpenZeppelin smart accounts from Stellar’s smart-account-kit, with an Ed25519 signer. No trustline, no reserve',
    ref: 'smart-account-kit',
    href: SMART_ACCOUNT_KIT_URL,
  },
  {
    name: 'Fees',
    does: 'The relayer is the source of every transaction and pays the fee. The gifter signs only the auth entry',
    ref: 'sponsored',
    href: RECEIPTS[0].url,
  },
  {
    name: 'Keys',
    does: 'SEP-5 phrase, encrypted with your PIN on your machine. It restores in any Stellar wallet',
    ref: "m/44'/148'/0'",
    href: 'https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0005.md',
  },
  {
    name: 'USDC',
    does: 'Circle’s testnet USDC through its Stellar Asset Contract',
    ref: short(USDC_CONTRACT_ID),
    href: USDC_URL,
  },
]

export function OnStellar() {
  return (
    <Section id="stellar" tone="surface">
      <Container>
        <Reveal>
          <SectionHead
            eyebrow="On Stellar"
            title="Every number on this page is checkable on Stellar."
            lead="Five pieces do the work, all on testnet, all open. The receipts below were made by the code in the repo."
          />
        </Reveal>
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
          <Reveal className="lg:col-span-7">
            <ul className="border-t border-fg">
              {PARTS.map((part) => (
                <li key={part.name} className="border-b border-line-strong">
                  <a
                    href={part.href}
                    target="_blank"
                    rel="noreferrer"
                    className="group -mx-3 grid gap-1 rounded-[12px] px-3 py-5 no-underline transition-colors duration-150 hover:bg-fill sm:grid-cols-[150px_1fr_auto] sm:items-baseline sm:gap-6"
                  >
                    <span className="text-[15px] font-semibold text-fg">{part.name}</span>
                    <span className="t-small text-fg-mute">{part.does}</span>
                    <span className="font-mono text-[12px] whitespace-nowrap text-fg-soft group-hover:text-fg">
                      {part.ref} ↗
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={80} className="flex flex-col gap-3 lg:col-span-5">
            <p className="t-label mb-1">Receipts</p>
            {RECEIPTS.map((receipt) => (
              <a
                key={receipt.hash}
                href={receipt.url}
                target="_blank"
                rel="noreferrer"
                className="group flex flex-col gap-2 rounded-tile bg-tile p-5 text-fg no-underline shadow-card transition-transform duration-200 hover:-translate-y-0.5"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-[15px] font-semibold">{receipt.what}</span>
                  <span className="font-mono text-[12px] text-fg-faint group-hover:text-fg">{receipt.hash.slice(0, 8)}… ↗</span>
                </span>
                <span className="t-small text-fg-mute">{receipt.detail}</span>
              </a>
            ))}
            <ArrowLink href="https://github.com/mikemoulder/tipee#how-stellar-is-used" className="mt-2">
              How each piece is used, in the README
            </ArrowLink>
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}
