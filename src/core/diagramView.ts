export const minDiagramScale = 0.25
export const maxDiagramScale = 4
const minReadableLabelPixels = 14
const inlineMinHeight = 160
const inlineMaxHeight = 672
const touchDragThreshold = 6
const nativeControlSelector =
  'input, select, textarea, button, a[href], label, summary, [contenteditable]:not([contenteditable="false"])'

export type DiagramCameraMode = "overview" | "readable" | "focus"
export type DiagramKeyboardPan = "arrows" | "shift-arrows"

/** Coordinates relative to the top-left of the unscaled stage, in CSS pixels. */
export interface DiagramRegion extends DiagramPoint {
  width: number
  height: number
}

export interface DiagramViewState {
  cameraMode: DiagramCameraMode
  naturalHeight: number
  naturalWidth: number
  scale: number
  userModified: boolean
  x: number
  y: number
}

export interface DiagramPoint {
  x: number
  y: number
}

export interface DiagramViewController {
  destroy(): void
  getState(): Readonly<DiagramViewState>
  refresh(forceCamera?: boolean): void
  reset(): void
  setCameraMode(mode: DiagramCameraMode): void
  /** Show a new focus region, or drop the region and return to the overview. */
  setFocusRegion(region?: Readonly<DiagramRegion>): void
  zoomBy(factor: number, clientPoint?: DiagramPoint): void
}

export interface DiagramViewOptions {
  /** Limits automatic focus zoom, not manual zoom. Defaults to the manual maximum (4). */
  focusMaxScale?: number
  focusRegion?: Readonly<DiagramRegion>
  getKeyboardPan?: () => DiagramKeyboardPan | undefined
  isExpanded?: () => boolean
  /** Returns false while host content is loading or unavailable. Hidden views always ignore input. */
  isInteractionEnabled?: () => boolean
  isKeyboardEnabled?: () => boolean
  /** Defaults to true. Set to false if the host owns the viewport height. */
  manageInlineHeight?: boolean
  onCameraModeChange?: (mode: DiagramCameraMode) => void
  onCropChange?: (cropped: boolean) => void
  onEscape?: () => boolean
  onFocusRegionChange?: (hasFocusRegion: boolean) => void
  onScaleChange?: (scale: number, minimumScale: number, maximumScale: number) => void
  /** Defaults to readable labels. Native centers at 100% and allows zooming back out to fit. */
  resetMode?: "readable" | "native"
}

interface PointerPosition {
  clientX: number
  clientY: number
}

type VisibleRegionListener = (region: Readonly<DiagramRegion>) => void

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

const focusProperties = {
  x: "--ndv-region-x",
  y: "--ndv-region-y",
  width: "--ndv-region-width",
  height: "--ndv-region-height",
} as const
const focusDimensions = Object.keys(focusProperties) as (keyof DiagramRegion)[]

export function sameRegion(a?: Readonly<DiagramRegion>, b?: Readonly<DiagramRegion>): boolean {
  if (!a || !b) return a === b
  return focusDimensions.every((dimension) => Object.is(a[dimension], b[dimension]))
}

function validRegion(region?: Readonly<DiagramRegion>): region is Readonly<DiagramRegion> {
  return (
    !!region &&
    focusDimensions.every((dimension) => Number.isFinite(region[dimension])) &&
    region.x >= 0 &&
    region.y >= 0 &&
    region.width > 0 &&
    region.height > 0
  )
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function localPoint(viewport: HTMLElement, point: DiagramPoint): DiagramPoint {
  const bounds = viewport.getBoundingClientRect()
  return { x: point.x - bounds.left, y: point.y - bounds.top }
}

function distance(a: PointerPosition, b: PointerPosition): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

function center(a: PointerPosition, b: PointerPosition): DiagramPoint {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
}

/**
 * Mount a camera on host-owned content. Mark selectable SVG nodes with
 * `data-diagram-node` to allow expanded touch pan/pinch while retaining taps.
 * Native controls and editable descendants keep their own gestures. The host
 * owns node accessibility/activation and inline/expanded touch-action CSS.
 */
export function createDiagramView(
  viewport: HTMLElement,
  stage: HTMLElement,
  options: DiagramViewOptions = {},
): DiagramViewController {
  return createDiagramViewWithGestureControl(viewport, stage, options).camera
}

export function createDiagramViewWithGestureControl(
  viewport: HTMLElement,
  stage: HTMLElement,
  options: DiagramViewOptions,
): {
  camera: DiagramViewController & { stopGestures(): void }
  subscribeVisibleRegion(listener: VisibleRegionListener): () => void
} {
  const state: DiagramViewState = {
    cameraMode: "overview",
    naturalHeight: 1,
    naturalWidth: 1,
    scale: 1,
    userModified: false,
    x: 0,
    y: 0,
  }
  const pointers = new Map<number, PointerPosition & { startX: number; startY: number }>()
  const captures = new Map<number, Element>()
  const pendingTouchClicks = new Set<number>()
  let touchMoved = false
  let mousePointerId: number | undefined
  let mouseLast: DiagramPoint | undefined
  let touchLast: DiagramPoint | undefined
  let pinch:
    | {
        distance: number
        scale: number
        world: DiagramPoint
      }
    | undefined
  let minimumScale = minDiagramScale
  let resizeFrame = 0
  let previousWidth = 0
  let previousHeight = 0
  let cameraMode: DiagramCameraMode = "overview"
  let requestedRegion: DiagramRegion | undefined
  let activeRegion: DiagramRegion | undefined
  let measuredDiagram: SVGSVGElement | undefined
  let visibleRegionListeners: Set<VisibleRegionListener> | undefined
  let destroyed = false

  const expanded = () => options.isExpanded?.() === true
  const nativeReset = options.resetMode === "native"
  const focusMaxScale = Math.min(
    positive(options.focusMaxScale ?? 0, maxDiagramScale),
    maxDiagramScale,
  )

  function svg(): SVGSVGElement | undefined {
    const candidate = stage.querySelector("svg")
    return candidate instanceof SVGSVGElement ? candidate : undefined
  }

  function readNaturalSize(diagram: SVGSVGElement): void {
    const values = (diagram.getAttribute("viewBox") ?? "")
      .trim()
      .split(/[\s,]+/)
      .map(Number)
    state.naturalWidth = positive(
      diagram.viewBox?.baseVal.width ?? values[2] ?? 0,
      positive(Number.parseFloat(diagram.getAttribute("width") ?? ""), 1),
    )
    state.naturalHeight = positive(
      diagram.viewBox?.baseVal.height ?? values[3] ?? 0,
      positive(Number.parseFloat(diagram.getAttribute("height") ?? ""), 1),
    )
    stage.style.width = `${state.naturalWidth}px`
    stage.style.height = `${state.naturalHeight}px`
  }

  function padding() {
    const style = getComputedStyle(viewport)
    return {
      bottom: Number.parseFloat(style.paddingBottom) || 0,
      left: Number.parseFloat(style.paddingLeft) || 0,
      right: Number.parseFloat(style.paddingRight) || 0,
      top: Number.parseFloat(style.paddingTop) || 0,
    }
  }

  function isVisible(): boolean {
    if (
      destroyed ||
      !viewport.isConnected ||
      !stage.isConnected ||
      viewport.hidden ||
      stage.hidden
    ) {
      return false
    }
    const { display, visibility } = getComputedStyle(stage)
    return display !== "none" && visibility !== "hidden" && visibility !== "collapse"
  }

  function hasSpace(): boolean {
    const inset = padding()
    return (
      viewport.clientWidth > inset.left + inset.right &&
      viewport.clientHeight > inset.top + inset.bottom
    )
  }

  function acceptsInput(): boolean {
    return isVisible() && hasSpace() && options.isInteractionEnabled?.() !== false
  }

  function getVisibleRegion(inset = padding()): Readonly<DiagramRegion> | undefined {
    if (
      !measuredDiagram ||
      !stage.contains(measuredDiagram) ||
      !isVisible() ||
      options.isInteractionEnabled?.() === false
    ) {
      return undefined
    }
    const { naturalWidth, naturalHeight, scale, x, y } = state
    const width = naturalWidth * scale
    const height = naturalHeight * scale
    // The camera translation and client box share one origin. Clip to the scaled stage
    // before normalizing, so padding and empty space around the diagram do not count.
    const left = Math.max(0, inset.left - x)
    const top = Math.max(0, inset.top - y)
    const right = Math.min(width, viewport.clientWidth - inset.right - x)
    const bottom = Math.min(height, viewport.clientHeight - inset.bottom - y)
    const region = {
      x: left / width,
      y: top / height,
      width: (right - left) / width,
      height: (bottom - top) / height,
    }
    return validRegion(region) ? Object.freeze(region) : undefined
  }

  function subscribeVisibleRegion(listener: VisibleRegionListener): () => void {
    if (destroyed) return () => {}
    visibleRegionListeners ??= new Set()
    const listeners = visibleRegionListeners
    let previous: Readonly<DiagramRegion> | undefined
    const notify: VisibleRegionListener = (region) => {
      if (sameRegion(region, previous)) return
      previous = region
      listener(region)
    }
    listeners.add(notify)
    const current = getVisibleRegion()
    if (current) notify(current)
    return () => {
      listeners.delete(notify)
    }
  }

  function updateInlineHeight(): void {
    if (options.manageInlineHeight === false) return
    if (expanded()) {
      viewport.style.removeProperty("height")
      return
    }
    const inset = padding()
    const width = Math.max(1, viewport.clientWidth - inset.left - inset.right)
    const fit = Math.min(1, width / state.naturalWidth)
    const desired = state.naturalHeight * fit + inset.top + inset.bottom
    const limit = Math.max(inlineMinHeight, window.innerHeight * 0.75)
    viewport.style.height = `${Math.ceil(clamp(desired, inlineMinHeight, Math.min(inlineMaxHeight, limit)))}px`
  }

  function labelFontSize(): number {
    const diagram = svg()
    if (!diagram) return 16
    const sizes = [...diagram.querySelectorAll("text, foreignObject span, foreignObject p")]
      .map((label) => Number.parseFloat(getComputedStyle(label).fontSize))
      .filter((size) => Number.isFinite(size) && size > 0)
    return sizes.length ? Math.min(...sizes) : 16
  }

  function constrain(): void {
    const inset = padding()
    const width = state.naturalWidth * state.scale
    const height = state.naturalHeight * state.scale
    const innerWidth = Math.max(1, viewport.clientWidth - inset.left - inset.right)
    const innerHeight = Math.max(1, viewport.clientHeight - inset.top - inset.bottom)

    state.x =
      width <= innerWidth
        ? inset.left + (innerWidth - width) / 2
        : clamp(state.x, viewport.clientWidth - inset.right - width, inset.left)
    state.y =
      height <= innerHeight
        ? inset.top + (innerHeight - height) / 2
        : clamp(state.y, viewport.clientHeight - inset.bottom - height, inset.top)
  }

  function apply(): void {
    constrain()
    stage.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.scale})`
    options.onScaleChange?.(state.scale, minimumScale, maxDiagramScale)
    const inset = padding()
    const cropped =
      state.naturalWidth * state.scale > viewport.clientWidth - inset.left - inset.right + 1 ||
      state.naturalHeight * state.scale > viewport.clientHeight - inset.top - inset.bottom + 1
    viewport.dataset.diagramCropped = String(cropped)
    options.onCropChange?.(cropped)
    if (visibleRegionListeners?.size) {
      const region = getVisibleRegion(inset)
      if (region) for (const listener of visibleRegionListeners) listener(region)
    }
  }

  function updateFocusFrame(region?: DiagramRegion): void {
    if (activeRegion === region) return
    const hadRegion = activeRegion !== undefined
    activeRegion = region
    for (const dimension of focusDimensions) {
      const property = focusProperties[dimension]
      if (region) stage.style.setProperty(property, `${region[dimension]}px`)
      else stage.style.removeProperty(property)
    }
    stage.toggleAttribute("data-ndv-focus-region", region !== undefined)
    if (hadRegion !== (region !== undefined)) options.onFocusRegionChange?.(region !== undefined)
  }

  function cameraGeometry() {
    const inset = padding()
    const width = viewport.clientWidth - inset.left - inset.right
    const height = viewport.clientHeight - inset.top - inset.bottom
    const fit = Math.min(width / state.naturalWidth, height / state.naturalHeight)
    const overview = Math.min(positive(expanded() ? fit : Math.min(1, fit), 1), maxDiagramScale)
    return { inset, width, height, overview }
  }

  function applyCameraMode(): void {
    const { inset, width, height, overview } = cameraGeometry()
    const region = cameraMode === "focus" ? activeRegion : undefined
    state.cameraMode = cameraMode === "focus" && !region ? "overview" : cameraMode

    if (state.cameraMode === "readable" && !nativeReset) {
      state.scale = clamp(
        Math.max(1, minReadableLabelPixels / labelFontSize()),
        minDiagramScale,
        maxDiagramScale,
      )
      minimumScale = minDiagramScale
      state.x = inset.left
      state.y = inset.top
    } else {
      minimumScale = Math.min(minDiagramScale, overview)
      state.scale = state.cameraMode === "readable" ? 1 : overview
      if (region) {
        state.scale = Math.max(
          overview,
          Math.min(width / region.width, height / region.height, focusMaxScale),
        )
      }
      state.x =
        inset.left +
        width / 2 -
        (region ? region.x + region.width / 2 : state.naturalWidth / 2) * state.scale
      state.y =
        inset.top +
        height / 2 -
        (region ? region.y + region.height / 2 : state.naturalHeight / 2) * state.scale
    }
    apply()
    options.onCameraModeChange?.(state.cameraMode)
  }

  function setScaleAt(next: number, point: DiagramPoint, worldPoint?: DiagramPoint): void {
    const world = worldPoint ?? {
      x: (point.x - state.x) / state.scale,
      y: (point.y - state.y) / state.scale,
    }
    state.scale = clamp(next, minimumScale, maxDiagramScale)
    state.x = point.x - world.x * state.scale
    state.y = point.y - world.y * state.scale
    state.userModified = true
    apply()
  }

  function zoomBy(factor: number, clientPoint?: DiagramPoint): void {
    if (!(Number.isFinite(factor) && factor > 0) || !acceptsInput()) return
    const point = clientPoint
      ? localPoint(viewport, clientPoint)
      : { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }
    setScaleAt(state.scale * factor, point)
  }

  function panBy(x: number, y: number): void {
    state.x += x
    state.y += y
    state.userModified = true
    apply()
  }

  function refresh(forceCamera = false): void {
    if (destroyed) return
    const oldWidth = previousWidth || viewport.clientWidth
    const oldHeight = previousHeight || viewport.clientHeight
    const worldCenter = {
      x: (oldWidth / 2 - state.x) / state.scale,
      y: (oldHeight / 2 - state.y) / state.scale,
    }
    const diagram = svg()
    if (diagram) readNaturalSize(diagram)
    const region = requestedRegion
    const resolved =
      region &&
      diagram &&
      region.x + region.width <= state.naturalWidth &&
      region.y + region.height <= state.naturalHeight
        ? region
        : undefined
    if (resolved !== activeRegion && cameraMode === "focus") state.userModified = false
    updateFocusFrame(resolved)
    if (!isVisible()) {
      measuredDiagram = undefined
      stopGestures()
      return
    }
    updateInlineHeight()
    const usable = hasSpace()
    measuredDiagram = usable ? diagram : undefined
    if (!usable || options.isInteractionEnabled?.() === false || forceCamera) stopGestures()
    if (!usable) return
    previousWidth = viewport.clientWidth
    previousHeight = viewport.clientHeight
    if (forceCamera || !state.userModified) {
      state.userModified = false
      applyCameraMode()
      return
    }
    if (nativeReset) {
      minimumScale = Math.min(minDiagramScale, cameraGeometry().overview)
      state.scale = clamp(state.scale, minimumScale, maxDiagramScale)
    }
    state.x = viewport.clientWidth / 2 - worldCenter.x * state.scale
    state.y = viewport.clientHeight / 2 - worldCenter.y * state.scale
    apply()
  }

  function setCameraMode(mode: DiagramCameraMode): void {
    if (destroyed) return
    stopGestures()
    cameraMode = mode
    // The requested mode also wins if the update happens while source is visible.
    state.userModified = false
    refresh()
  }

  function setFocusRegion(region?: Readonly<DiagramRegion>): void {
    if (destroyed) return
    const next = validRegion(region) ? region : undefined
    if (sameRegion(requestedRegion, next)) return
    requestedRegion = next && { ...next }
    setCameraMode(next ? "focus" : "overview")
  }

  function reset(): void {
    if (acceptsInput()) setCameraMode(activeRegion ? "focus" : "readable")
  }

  function capture(event: PointerEvent, owner: Element = viewport): void {
    try {
      owner.setPointerCapture(event.pointerId)
      captures.set(event.pointerId, owner)
    } catch {
      // Document-level pointer events still complete the gesture if capture fails.
    }
  }

  function releaseCapture(pointerId: number): void {
    const owner = captures.get(pointerId)
    captures.delete(pointerId)
    try {
      owner?.releasePointerCapture(pointerId)
    } catch {
      // The browser may already have released or cancelled this pointer.
    }
  }

  function stopGestures(): void {
    pointers.clear()
    mousePointerId = undefined
    mouseLast = undefined
    touchLast = undefined
    pinch = undefined
    pendingTouchClicks.clear()
    for (const pointerId of captures.keys()) releaseCapture(pointerId)
  }

  function isInteractiveTarget(target: EventTarget | null, touchNode?: SVGElement): boolean {
    if (!(target instanceof Element)) return false
    let control = target.closest(`${nativeControlSelector}, [tabindex]`)
    while (control && control !== viewport && viewport.contains(control)) {
      if (control !== touchNode || control.matches(nativeControlSelector)) return true
      control = control.parentElement?.closest(`${nativeControlSelector}, [tabindex]`) ?? null
    }
    return false
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.defaultPrevented || !acceptsInput()) return
    if (pointers.size === 0) pendingTouchClicks.clear()
    const candidate =
      event.pointerType === "touch" && event.target instanceof Element
        ? event.target.closest("[data-diagram-node]")
        : null
    const touchNode =
      candidate instanceof SVGElement && stage.contains(candidate) ? candidate : undefined
    if (isInteractiveTarget(event.target, touchNode)) return
    if (event.pointerType === "touch") {
      if (!expanded() || event.button !== 0) return
      if (pointers.size === 0) touchMoved = false
      pointers.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
      })
      // Capture on the selectable node so a stationary tap still clicks that node.
      capture(event, touchNode ?? viewport)
      if (pointers.size === 1) {
        touchLast = { x: event.clientX, y: event.clientY }
      } else if (pointers.size === 2) {
        const [first, second] = [...pointers.values()]
        if (!first || !second) return
        const point = localPoint(viewport, center(first, second))
        pinch = {
          distance: Math.max(1, distance(first, second)),
          scale: state.scale,
          world: { x: (point.x - state.x) / state.scale, y: (point.y - state.y) / state.scale },
        }
        touchLast = undefined
      }
      return
    }
    if (event.button !== 0 || event.isPrimary === false || mousePointerId !== undefined) return
    mousePointerId = event.pointerId
    mouseLast = { x: event.clientX, y: event.clientY }
    capture(event)
    viewport.focus({ preventScroll: true })
    event.preventDefault()
  }

  function onPointerMove(event: PointerEvent): void {
    const pointer = pointers.get(event.pointerId)
    if (!pointer && event.pointerId !== mousePointerId) return
    if (!acceptsInput()) {
      stopGestures()
      return
    }
    if (event.pointerType === "touch" && pointer) {
      if (
        Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) >
        touchDragThreshold
      ) {
        touchMoved = true
      }
      pointers.set(event.pointerId, { ...pointer, clientX: event.clientX, clientY: event.clientY })
      if (pointers.size === 2 && pinch) {
        const [first, second] = [...pointers.values()]
        if (!first || !second) return
        const point = localPoint(viewport, center(first, second))
        setScaleAt(pinch.scale * (distance(first, second) / pinch.distance), point, pinch.world)
      } else if (pointers.size === 1 && touchLast) {
        panBy(event.clientX - touchLast.x, event.clientY - touchLast.y)
        touchLast = { x: event.clientX, y: event.clientY }
      }
      event.preventDefault()
      return
    }
    if (event.pointerId !== mousePointerId || !mouseLast) return
    panBy(event.clientX - mouseLast.x, event.clientY - mouseLast.y)
    mouseLast = { x: event.clientX, y: event.clientY }
    event.preventDefault()
  }

  function stopPointer(event: PointerEvent): void {
    if (pointers.has(event.pointerId)) {
      if (event.type !== "pointercancel" && touchMoved) pendingTouchClicks.add(event.pointerId)
      pointers.delete(event.pointerId)
      if (pointers.size < 2) pinch = undefined
      const remaining = [...pointers.values()][0]
      touchLast = remaining ? { x: remaining.clientX, y: remaining.clientY } : undefined
    }
    if (event.pointerId === mousePointerId) {
      mousePointerId = undefined
      mouseLast = undefined
    }
    releaseCapture(event.pointerId)
  }

  function onClick(event: MouseEvent): void {
    // Keyboard, assistive technology and programmatic activation are not drag clicks.
    if (event.detail === 0 || pendingTouchClicks.size === 0 || !acceptsInput()) return
    if ("pointerId" in event) {
      if (!pendingTouchClicks.delete(event.pointerId as number)) return
    } else {
      // Older browsers emit MouseEvent clicks without pointer identity.
      pendingTouchClicks.clear()
    }
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  function onWheel(event: WheelEvent): void {
    if (
      event.defaultPrevented ||
      (!event.ctrlKey && !event.metaKey) ||
      !Number.isFinite(event.deltaY) ||
      event.deltaY === 0 ||
      isInteractiveTarget(event.target) ||
      !acceptsInput()
    )
      return
    event.preventDefault()
    zoomBy(event.deltaY < 0 ? 1.1 : 0.9, { x: event.clientX, y: event.clientY })
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return
    if (
      event.key !== "Escape" &&
      (event.target !== viewport || options.isKeyboardEnabled?.() === false || !acceptsInput())
    )
      return
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown":
        if (options.getKeyboardPan?.() === "shift-arrows" && !event.shiftKey) return
        panBy(
          event.key === "ArrowLeft" ? 40 : event.key === "ArrowRight" ? -40 : 0,
          event.key === "ArrowUp" ? 40 : event.key === "ArrowDown" ? -40 : 0,
        )
        break
      case "+":
      case "=":
        zoomBy(1.25)
        break
      case "-":
        zoomBy(0.8)
        break
      case "0":
        setCameraMode("overview")
        break
      case "Escape":
        if (!options.onEscape?.()) return
        break
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  viewport.addEventListener("pointerdown", onPointerDown)
  const ownerDocument = viewport.ownerDocument
  ownerDocument.addEventListener("pointermove", onPointerMove, { passive: false })
  ownerDocument.addEventListener("pointerup", stopPointer)
  ownerDocument.addEventListener("pointercancel", stopPointer)
  ownerDocument.addEventListener("lostpointercapture", stopPointer)
  viewport.addEventListener("click", onClick, true)
  viewport.addEventListener("wheel", onWheel, { passive: false })
  viewport.addEventListener("keydown", onKeyDown)

  const resizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          cancelAnimationFrame(resizeFrame)
          resizeFrame = requestAnimationFrame(() => refresh())
        })
      : undefined
  resizeObserver?.observe(viewport)
  if (validRegion(options.focusRegion)) setFocusRegion(options.focusRegion)
  else refresh()

  const camera = {
    destroy() {
      if (destroyed) return
      destroyed = true
      visibleRegionListeners?.clear()
      cancelAnimationFrame(resizeFrame)
      resizeObserver?.disconnect()
      updateFocusFrame()
      stopGestures()
      viewport.removeEventListener("pointerdown", onPointerDown)
      ownerDocument.removeEventListener("pointermove", onPointerMove)
      ownerDocument.removeEventListener("pointerup", stopPointer)
      ownerDocument.removeEventListener("pointercancel", stopPointer)
      ownerDocument.removeEventListener("lostpointercapture", stopPointer)
      viewport.removeEventListener("click", onClick, true)
      viewport.removeEventListener("wheel", onWheel)
      viewport.removeEventListener("keydown", onKeyDown)
    },
    getState: () => state,
    refresh,
    reset,
    setCameraMode,
    setFocusRegion,
    stopGestures,
    zoomBy,
  }
  return { camera, subscribeVisibleRegion }
}
