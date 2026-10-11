import { ButtonLink, Container, Eyebrow } from '@/components/ui'

/**
 * Next ships a default 404 that is black-on-white and ignores the theme
 * entirely — which on a cream site reads as a crashed page rather than a wrong
 * address. It is also the page a mistyped `/c/@handle` will land on once public
 * creator pages exist, so it is worth more than a shrug.
 */
export default function NotFound() {
  return (
    <section className="relative overflow-hidden">
      <div className="aurora" aria-hidden="true" />
      <Container className="relative z-10 flex min-h-[62vh] flex-col justify-center gap-7 py-24">
        <div className="flex max-w-[620px] flex-col gap-5">
          <Eyebrow>404</Eyebrow>
          <h1 className="m-0 text-display font-extrabold text-balance">
            Nothing is waiting at this address.
          </h1>
          <p className="m-0 text-[17px] leading-relaxed text-muted">
            The page you were after does not exist. If you were looking for a channel, the check on
            the home page takes a handle or a full channel URL.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <ButtonLink href="/" size="lg">
              Check a channel
            </ButtonLink>
            <ButtonLink href="/viewers" tone="secondary" size="lg">
              I want to tip someone
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  )
}
