import { Close } from '@/components/landing/close'
import { Contrast } from '@/components/landing/contrast'
import { Creators } from '@/components/landing/creators'
import { Hero } from '@/components/landing/hero'
import { How } from '@/components/landing/how'
import { OnStellar } from '@/components/landing/on-stellar'

/** The storyboard, in order (DESIGN.md §4). */
export default function Home() {
  return (
    <>
      <Hero />
      <How />
      <Creators />
      <Contrast />
      <OnStellar />
      <Close />
    </>
  )
}
