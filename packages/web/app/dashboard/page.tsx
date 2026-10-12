import type { Metadata } from 'next'

import { CreatorDashboard } from '@/components/dashboard'
import { Container } from '@/components/primitives'

export const metadata: Metadata = {
  title: 'Your dashboard',
  description: 'Sign in with your passkey to see what your viewers sent and pay it out.',
  robots: { index: false },
}

export default function DashboardPage() {
  return (
    <section className="pt-12 pb-[var(--section-y)] sm:pt-16">
      <Container>
        <CreatorDashboard />
      </Container>
    </section>
  )
}
