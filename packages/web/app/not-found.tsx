import { ArrowLink, Button, Container } from '@/components/primitives'

export default function NotFound() {
  return (
    <section className="py-[var(--section-y)]">
      <Container size="text" className="flex flex-col items-start gap-6">
        <p className="t-label">404</p>
        <h1 className="t-display-l">Nothing is waiting at this address.</h1>
        <p className="t-lead">The page may have moved. Tips, though, wait patiently until someone claims them.</p>
        <div className="flex flex-wrap items-center gap-5">
          <Button href="/">Back to Tipee</Button>
          <ArrowLink href="/claim">Claim your tips</ArrowLink>
        </div>
      </Container>
    </section>
  )
}
