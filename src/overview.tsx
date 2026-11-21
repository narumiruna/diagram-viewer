import { type CSSProperties, type RefObject, useEffect, useState } from "react"
import { serializeDiagramSvg } from "./core/diagramExport.js"
import type { DiagramRegion } from "./core/diagramView.js"

type Subscribe = (listener: (region: Readonly<DiagramRegion>) => void) => () => void

interface Thumbnail {
  source: string
  url: string
  ratio: number
}

export function useOverviewThumbnail(
  source: string | undefined,
  stage: RefObject<HTMLElement | null>,
) {
  const [thumbnail, setThumbnail] = useState<Thumbnail>()
  useEffect(() => {
    setThumbnail(undefined)
    if (!source || typeof URL.createObjectURL !== "function") return
    const svg = stage.current?.querySelector("svg")
    if (!svg) return

    let url: string
    try {
      const snapshot = serializeDiagramSvg(svg, "transparent")
      url = URL.createObjectURL(new Blob([snapshot], { type: "image/svg+xml;charset=utf-8" }))
    } catch {
      return
    }
    const image = new Image()
    image.onload = () => {
      const ratio = image.naturalWidth / image.naturalHeight
      if (Number.isFinite(ratio) && ratio > 0) setThumbnail({ source, url, ratio })
    }
    let released = false
    const release = () => {
      if (released) return
      released = true
      image.onload = null
      image.onerror = null
      image.removeAttribute("src")
      URL.revokeObjectURL(url)
    }
    image.onerror = release
    image.src = url
    return release
  }, [source, stage])
  return thumbnail?.source === source ? thumbnail : undefined
}

function OverviewFrame({ subscribe }: { subscribe: Subscribe }) {
  const [region, setRegion] = useState<Readonly<DiagramRegion>>()
  useEffect(() => {
    let next: Readonly<DiagramRegion>
    let frame: number | undefined
    const unsubscribe = subscribe((region) => {
      next = region
      frame ??= requestAnimationFrame(() => {
        frame = undefined
        setRegion(next)
      })
    })
    return () => {
      unsubscribe()
      if (frame !== undefined) cancelAnimationFrame(frame)
    }
  }, [subscribe])
  if (!region) return null
  return (
    <div
      className="ndv-overview-frame"
      style={{
        left: `${region.x * 100}%`,
        top: `${region.y * 100}%`,
        width: `${region.width * 100}%`,
        height: `${region.height * 100}%`,
      }}
    />
  )
}

export function ViewerOverview({
  thumbnail,
  id,
  open,
  subscribe,
}: {
  thumbnail: Thumbnail
  id: string
  open: boolean
  subscribe: Subscribe
}) {
  return (
    <aside className="ndv-overview" id={id} aria-label="Overview" hidden={!open}>
      <p className="ndv-overview-title">Overview</p>
      {open && (
        <div
          className="ndv-overview-image"
          style={{ "--ndv-overview-ratio": thumbnail.ratio } as CSSProperties}
          aria-hidden="true"
        >
          <img src={thumbnail.url} alt="" />
          <OverviewFrame subscribe={subscribe} />
        </div>
      )}
      <p className="ndv-overview-key">Visible area</p>
    </aside>
  )
}
