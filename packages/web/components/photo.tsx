'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * A local photo (public/people) that quietly becomes its fallback when the
 * file is missing or fails, so a page waiting on a picture never shows a
 * broken-image icon.
 */
export function Photo({ src, alt = '', className, fallback }: { src: string; alt?: string; className?: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false)
  const img = useRef<HTMLImageElement>(null)
  // A load that failed before hydration never reaches onError, so check once mounted.
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth === 0) setFailed(true)
  }, [src])
  if (failed) return <>{fallback}</>
  return (
    // next/image would 404 loudly while a file is still to come.
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={img} src={src} alt={alt} className={className} onError={() => setFailed(true)} decoding="async" loading="lazy" />
  )
}
