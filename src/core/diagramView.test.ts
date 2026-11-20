import { afterEach, describe, expect, it, vi } from "vitest"
import { createDiagramView, maxDiagramScale, minDiagramScale } from "./diagramView.js"

function fixture() {
  const viewport = document.createElement("section")
  const stage = document.createElement("div")
  stage.innerHTML = '<svg viewBox="0 0 1000 500"><text style="font-size: 10px">Label</text></svg>'
  viewport.append(stage)
  document.body.append(viewport)
  Object.defineProperties(viewport, {
    clientWidth: { configurable: true, value: 500 },
    clientHeight: { configurable: true, value: 300 },
  })
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
    bottom: 300,
    height: 300,
    left: 0,
    right: 500,
    top: 0,
    width: 500,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  return { stage, viewport }
}

afterEach(() => document.body.replaceChildren())

function pointer(
  type: string,
  id: number,
  x: number,
  y: number,
  pointerType = "touch",
  button = 0,
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    button: { value: button },
    clientX: { value: x },
    clientY: { value: y },
    pointerId: { value: id },
    pointerType: { value: pointerType },
  })
  return event
}

function nodeFixture(expanded = true) {
  const { stage, viewport } = fixture()
  stage.innerHTML = `<svg viewBox="0 0 1000 500"><g data-diagram-node role="button" tabindex="0">
    <rect width="400" height="200"/><text>Selectable node</text>
  </g></svg>`
  const node = stage.querySelector("g")
  const target = node?.querySelector("rect")
  if (!node || !target) throw new Error("Missing selectable node")
  const activate = vi.fn()
  node.addEventListener("click", activate)
  const controller = createDiagramView(viewport, stage, { isExpanded: () => expanded })
  controller.reset()
  return { stage, viewport, node, target, activate, controller }
}

function click(target: Element, id: number, detail = 1) {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, detail })
  Object.defineProperties(event, {
    pointerId: { value: id },
    pointerType: { value: "touch" },
  })
  target.dispatchEvent(event)
  return event
}

describe("selectable diagram node touch", () => {
  it("pans from a focusable node and suppresses its completed drag click", () => {
    const { target, node, controller, activate } = nodeFixture()
    const capture = vi.spyOn(node, "setPointerCapture")
    const before = controller.getState().x
    target.dispatchEvent(pointer("pointerdown", 7, 250, 150))
    target.dispatchEvent(pointer("pointermove", 7, 150, 150))
    expect(controller.getState().x).toBeLessThan(before)
    expect(capture).toHaveBeenCalledWith(7)
    target.dispatchEvent(pointer("pointerup", 7, 150, 150))
    expect(click(target, 7).defaultPrevented).toBe(true)
    expect(activate).not.toHaveBeenCalled()
    controller.destroy()
  })

  it("suppresses a post-drag click even when capture retargets it to the viewport", () => {
    const { viewport, controller } = nodeFixture()
    viewport.dispatchEvent(pointer("pointerdown", 7, 250, 150))
    viewport.dispatchEvent(pointer("pointermove", 7, 150, 150))
    viewport.dispatchEvent(pointer("pointerup", 7, 150, 150))
    expect(click(viewport, 7).defaultPrevented).toBe(true)
    controller.destroy()
  })

  it("keeps inline touch, taps, keyboard and programmatic activation available", () => {
    const { target, controller, activate } = nodeFixture(false)
    const before = { ...controller.getState() }
    target.dispatchEvent(pointer("pointerdown", 7, 250, 150))
    const move = pointer("pointermove", 7, 150, 150)
    target.dispatchEvent(move)
    target.dispatchEvent(pointer("pointerup", 7, 150, 150))
    expect(move.defaultPrevented).toBe(false)
    expect(controller.getState()).toEqual(before)
    expect(click(target, 7).defaultPrevented).toBe(false)
    expect(activate).toHaveBeenCalledOnce()
    controller.destroy()
  })

  it("does not suppress a tap with small motion or later non-pointer clicks", () => {
    const { target, controller, activate } = nodeFixture()
    target.dispatchEvent(pointer("pointerdown", 7, 250, 150))
    target.dispatchEvent(pointer("pointermove", 7, 248, 150))
    target.dispatchEvent(pointer("pointerup", 7, 248, 150))
    click(target, 7)
    expect(activate).toHaveBeenCalledTimes(1)
    target.dispatchEvent(pointer("pointerdown", 7, 250, 150))
    target.dispatchEvent(pointer("pointermove", 7, 150, 150))
    target.dispatchEvent(pointer("pointerup", 7, 150, 150))
    // No compatibility click was emitted for this drag. Do not eat later keyboard/AT clicks.
    click(target, -1, 0)
    click(target, 0, 0)
    expect(activate).toHaveBeenCalledTimes(3)
    target.dispatchEvent(pointer("pointerdown", 7, 250, 150))
    target.dispatchEvent(pointer("pointerup", 7, 250, 150))
    click(target, 7)
    expect(activate).toHaveBeenCalledTimes(4)
    controller.destroy()
  })

  it.each(["pointercancel", "lostpointercapture"])(
    "recovers from %s before the next tap",
    (end) => {
      const { target, controller, activate } = nodeFixture()
      target.dispatchEvent(pointer("pointerdown", 7, 250, 150))
      target.dispatchEvent(pointer("pointermove", 7, 150, 150))
      target.dispatchEvent(pointer(end, 7, 150, 150))
      const before = { ...controller.getState() }
      document.dispatchEvent(pointer("pointermove", 7, 50, 150))
      expect(controller.getState()).toEqual(before)
      target.dispatchEvent(pointer("pointerdown", 7, 250, 150))
      target.dispatchEvent(pointer("pointerup", 7, 250, 150))
      expect(click(target, 7).defaultPrevented).toBe(false)
      expect(activate).toHaveBeenCalledOnce()
      controller.destroy()
    },
  )

  it("ends a drag when a removed node loses capture on the document without leaking its click", () => {
    const { node, target, viewport, controller } = nodeFixture()
    target.dispatchEvent(pointer("pointerdown", 7, 250, 150))
    target.dispatchEvent(pointer("pointermove", 7, 150, 150))
    node.remove()
    document.dispatchEvent(pointer("lostpointercapture", 7, 150, 150))
    const before = { ...controller.getState() }
    document.dispatchEvent(pointer("pointermove", 7, 50, 150))
    document.dispatchEvent(pointer("pointerup", 7, 50, 150))
    expect(controller.getState()).toEqual(before)
    expect(click(viewport, 7).defaultPrevented).toBe(true)
    controller.destroy()
  })

  it("pinches on nodes and retains drag suppression when one moved pointer is cancelled", () => {
    const { target, viewport, controller } = nodeFixture()
    const activateViewport = vi.fn()
    viewport.addEventListener("click", activateViewport)
    const before = controller.getState().scale
    target.dispatchEvent(pointer("pointerdown", 7, 150, 150))
    target.dispatchEvent(pointer("pointerdown", 8, 250, 150))
    target.dispatchEvent(pointer("pointermove", 8, 350, 150))
    expect(controller.getState().scale).toBeGreaterThan(before)
    target.dispatchEvent(pointer("pointercancel", 8, 350, 150))
    target.dispatchEvent(pointer("pointerup", 7, 150, 150))
    // Capture can retarget the generated click to the viewport instead of the original node.
    expect(click(viewport, 7).defaultPrevented).toBe(true)
    expect(activateViewport).not.toHaveBeenCalled()
    controller.destroy()
  })

  it("tracks document completion when capture fails and releases captures/listeners on destroy", () => {
    const { target, node, viewport, controller } = nodeFixture()
    const capture = vi.spyOn(node, "setPointerCapture").mockImplementationOnce(() => {
      throw new Error("capture unavailable")
    })
    const release = vi.spyOn(node, "releasePointerCapture")
    target.dispatchEvent(pointer("pointerdown", 7, 250, 150))
    document.dispatchEvent(pointer("pointermove", 7, 150, 150))
    expect(controller.getState().userModified).toBe(true)
    document.dispatchEvent(pointer("pointerup", 7, 150, 150))
    target.dispatchEvent(pointer("pointerdown", 8, 250, 150))
    target.dispatchEvent(pointer("pointermove", 8, 150, 150))
    target.dispatchEvent(pointer("pointerdown", 9, 350, 150))
    expect(capture).toHaveBeenCalledTimes(3)
    controller.destroy()
    expect(release.mock.calls).toEqual([[8], [9]])
    const before = { ...controller.getState() }
    target.dispatchEvent(pointer("pointerdown", 10, 250, 150))
    document.dispatchEvent(pointer("pointermove", 8, 50, 150))
    viewport.dispatchEvent(pointer("lostpointercapture", 9, 350, 150))
    viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true }))
    viewport.dispatchEvent(new WheelEvent("wheel", { ctrlKey: true, deltaY: -1 }))
    expect(click(target, 8).defaultPrevented).toBe(false)
    expect(controller.getState()).toEqual(before)
    expect(capture).toHaveBeenCalledTimes(3)
  })

  it("preserves a later mouse click when the previous drag emitted no click", () => {
    const { target, controller } = nodeFixture()
    target.dispatchEvent(pointer("pointerdown", 7, 250, 150))
    target.dispatchEvent(pointer("pointermove", 7, 150, 150))
    target.dispatchEvent(pointer("pointerup", 7, 150, 150))
    target.dispatchEvent(pointer("pointerdown", 7, 150, 150, "mouse"))
    target.dispatchEvent(pointer("pointerup", 7, 150, 150, "mouse"))
    expect(click(target, 7).defaultPrevented).toBe(false)
    controller.destroy()
  })

  it("also suppresses older MouseEvent compatibility clicks without pointer identity", () => {
    const { target, controller } = nodeFixture()
    target.dispatchEvent(pointer("pointerdown", 7, 250, 150))
    target.dispatchEvent(pointer("pointermove", 7, 150, 150))
    target.dispatchEvent(pointer("pointerup", 7, 150, 150))
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })
    target.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    controller.destroy()
  })

  it.each(["mouse", "pen", "touch"])("ignores non-primary %s buttons", (pointerType) => {
    const { stage, viewport } = fixture()
    const controller = createDiagramView(viewport, stage, { isExpanded: () => true })
    const before = { ...controller.getState() }
    viewport.dispatchEvent(pointer("pointerdown", 7, 250, 150, pointerType, 2))
    viewport.dispatchEvent(pointer("pointermove", 7, 150, 150, pointerType, 2))
    viewport.dispatchEvent(pointer("pointerup", 7, 150, 150, pointerType, 2))
    expect(controller.getState()).toEqual(before)
    controller.destroy()
  })

  it("suppresses each moved pinch pointer but not another pointer's click", () => {
    const { target, controller } = nodeFixture()
    target.dispatchEvent(pointer("pointerdown", 7, 150, 150))
    target.dispatchEvent(pointer("pointerdown", 8, 250, 150))
    target.dispatchEvent(pointer("pointermove", 8, 350, 150))
    target.dispatchEvent(pointer("pointerup", 7, 150, 150))
    target.dispatchEvent(pointer("pointerup", 8, 350, 150))
    expect(click(target, 12).defaultPrevented).toBe(false)
    expect(click(target, 7).defaultPrevented).toBe(true)
    expect(click(target, 8).defaultPrevented).toBe(true)
    controller.destroy()
  })

  it("removes every registered listener with its original capture phase", () => {
    const { stage, viewport } = fixture()
    const addedViewport = vi.spyOn(viewport, "addEventListener")
    const removedViewport = vi.spyOn(viewport, "removeEventListener")
    const addedDocument = vi.spyOn(document, "addEventListener")
    const removedDocument = vi.spyOn(document, "removeEventListener")
    const controller = createDiagramView(viewport, stage)
    controller.destroy()
    for (const [added, removed] of [
      [addedViewport, removedViewport],
      [addedDocument, removedDocument],
    ] as const) {
      expect(added.mock.calls.length).toBeGreaterThan(0)
      for (const [type, listener, options] of added.mock.calls) {
        const capture = typeof options === "boolean" ? options : options?.capture === true
        expect(
          removed.mock.calls.some(
            ([removedType, removedListener, removedOptions]) =>
              type === removedType &&
              listener === removedListener &&
              capture ===
                (typeof removedOptions === "boolean"
                  ? removedOptions
                  : removedOptions?.capture === true),
          ),
        ).toBe(true)
      }
    }
  })

  it("keeps mouse, pen, wheel and keyboard isolated on opted-in nodes", () => {
    const { target, controller } = nodeFixture()
    const before = { ...controller.getState() }
    for (const type of ["mouse", "pen"]) {
      target.dispatchEvent(pointer("pointerdown", 7, 250, 150, type))
      target.dispatchEvent(pointer("pointermove", 7, 150, 150, type))
      target.dispatchEvent(pointer("pointerup", 7, 150, 150, type))
    }
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true }))
    target.dispatchEvent(new WheelEvent("wheel", { bubbles: true, ctrlKey: true, deltaY: -1 }))
    expect(controller.getState()).toEqual(before)
    controller.destroy()
  })

  it.each([
    '<foreignObject><input type="range" data-diagram-node></foreignObject>',
    "<foreignObject><button data-diagram-node><span>Button</span></button></foreignObject>",
    '<a href="#target" data-diagram-node><text>Link</text></a>',
    '<foreignObject><div contenteditable="true" data-diagram-node><span>Edit</span></div></foreignObject>',
    '<g role="slider" tabindex="0"><text>Custom control</text></g>',
    '<g role="button" tabindex="0"><text>Unmarked node</text></g>',
  ])("preserves nested control gestures despite the parent opt-in: %s", (html) => {
    const { node, controller } = nodeFixture()
    node.insertAdjacentHTML("beforeend", html)
    const target =
      node.lastElementChild?.querySelector("span, text, input") ?? node.lastElementChild
    if (!target) throw new Error("Missing nested control")
    const before = { ...controller.getState() }
    target.dispatchEvent(pointer("pointerdown", 7, 250, 150))
    const move = pointer("pointermove", 7, 150, 150)
    target.dispatchEvent(move)
    target.dispatchEvent(pointer("pointerup", 7, 150, 150))
    expect(move.defaultPrevented).toBe(false)
    expect(click(target, 7).defaultPrevented).toBe(false)
    expect(controller.getState()).toEqual(before)
    controller.destroy()
  })
})

describe("diagram view", () => {
  it("fits Overview without upscaling and computes a readable label scale", () => {
    const { stage, viewport } = fixture()
    const modes: string[] = []
    const controller = createDiagramView(viewport, stage, {
      onCameraModeChange: (mode) => modes.push(mode),
    })
    expect(controller.getState()).toMatchObject({ cameraMode: "overview", scale: 0.5 })
    expect(stage.style.transform).toContain("scale(0.5)")

    controller.setCameraMode("readable")
    expect(controller.getState()).toMatchObject({ cameraMode: "readable", scale: 1.4 })
    expect(modes).toEqual(["overview", "readable"])
    controller.destroy()
  })

  it("fits a region, preserves it in overview, and refocuses on resize and reset", () => {
    const { stage, viewport } = fixture()
    const region = { x: 600, y: 200, width: 250, height: 150 }
    const controller = createDiagramView(viewport, stage, { focusRegion: region })
    expect(controller.getState()).toMatchObject({
      cameraMode: "focus",
      scale: 2,
      x: -1200,
      y: -400,
    })
    expect(stage).toHaveAttribute("data-ndv-focus-region")
    expect(stage.style.getPropertyValue("--ndv-region-x")).toBe("600px")

    controller.setCameraMode("overview")
    controller.setFocusRegion({ ...region })
    expect(controller.getState()).toMatchObject({ cameraMode: "overview", scale: 0.5 })
    expect(stage).toHaveAttribute("data-ndv-focus-region")
    controller.reset()
    expect(controller.getState().scale).toBe(2)
    Object.defineProperty(viewport, "clientWidth", { value: 375 })
    controller.refresh()
    expect(controller.getState()).toMatchObject({ cameraMode: "focus", scale: 1.5 })
    controller.setFocusRegion(undefined)
    expect(controller.getState()).toMatchObject({ cameraMode: "overview", scale: 0.375 })
    expect(stage).not.toHaveAttribute("data-ndv-focus-region")
    controller.reset()
    expect(controller.getState()).toMatchObject({ cameraMode: "readable", scale: 1.4 })
    controller.destroy()
  })

  it("falls back for an invalid or unresolved region and refreshes once the SVG exists", () => {
    const { stage, viewport } = fixture()
    const svg = stage.firstElementChild
    stage.replaceChildren()
    const region = { x: 600, y: 200, width: 250, height: 150 }
    const controller = createDiagramView(viewport, stage, { focusRegion: region })
    expect(controller.getState().cameraMode).toBe("overview")
    expect(stage).not.toHaveAttribute("data-ndv-focus-region")

    if (!svg) throw new Error("Missing fixture SVG")
    stage.append(svg)
    controller.refresh()
    expect(controller.getState().cameraMode).toBe("focus")
    controller.setFocusRegion({ ...region, x: 999 })
    expect(controller.getState().cameraMode).toBe("overview")
    expect(stage).not.toHaveAttribute("data-ndv-focus-region")
    controller.setFocusRegion({ ...region, width: Infinity })
    expect(stage).not.toHaveAttribute("data-ndv-focus-region")

    controller.setFocusRegion(region)
    controller.destroy()
    expect(stage).not.toHaveAttribute("data-ndv-focus-region")
    expect(stage.style.getPropertyValue("--ndv-region-x")).toBe("")
  })

  it("applies a changed region when returning from source after a manual zoom", () => {
    const { stage, viewport } = fixture()
    const region = { x: 600, y: 200, width: 250, height: 150 }
    const controller = createDiagramView(viewport, stage, { focusRegion: region })
    controller.zoomBy(0.8)
    expect(controller.getState()).toMatchObject({ scale: 1.6, userModified: true })
    viewport.hidden = true
    controller.setFocusRegion({ x: 100, y: 100, width: 300, height: 200 })
    viewport.hidden = false
    controller.refresh()
    expect(controller.getState()).toMatchObject({
      cameraMode: "focus",
      scale: 1.5,
      x: -125,
      y: -150,
      userModified: false,
    })
    controller.destroy()
  })

  it("returns to overview if a hidden refresh invalidates the focus region", () => {
    const { stage, viewport } = fixture()
    const focusRegion = { x: 600, y: 200, width: 250, height: 150 }
    const controller = createDiagramView(viewport, stage, { focusRegion })
    try {
      controller.zoomBy(0.8)
      const manualView = { ...controller.getState() }
      expect(manualView).toMatchObject({ cameraMode: "focus", scale: 1.6, userModified: true })

      viewport.hidden = true
      controller.refresh()
      viewport.hidden = false
      controller.refresh()
      expect(controller.getState()).toEqual(manualView)

      viewport.hidden = true
      stage.innerHTML = '<svg viewBox="0 0 800 500"></svg>'
      controller.refresh()
      expect(stage).not.toHaveAttribute("data-ndv-focus-region")
      viewport.hidden = false
      controller.refresh()
      expect(controller.getState()).toMatchObject({
        cameraMode: "overview",
        scale: 0.6,
        userModified: false,
      })
    } finally {
      controller.destroy()
    }
  })

  it("reserves bare arrows and only consumes handled viewport shortcuts", () => {
    const { stage, viewport } = fixture()
    const navigated = vi.fn()
    document.body.addEventListener("keydown", navigated)
    const controller = createDiagramView(viewport, stage, { getKeyboardPan: () => "shift-arrows" })
    try {
      controller.reset()
      const before = controller.getState().x
      const bare = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      })
      viewport.dispatchEvent(bare)
      expect(bare.defaultPrevented).toBe(false)
      expect(navigated).toHaveBeenCalledExactlyOnceWith(bare)
      expect(controller.getState().x).toBe(before)

      const shifted = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
      viewport.dispatchEvent(shifted)
      expect(shifted.defaultPrevented).toBe(true)
      expect(navigated).toHaveBeenCalledOnce()
      expect(controller.getState().x).toBeLessThan(before)
    } finally {
      controller.destroy()
      document.body.removeEventListener("keydown", navigated)
    }
  })

  it.each(["span", "p"])("keeps HTML-only %s labels readable", (tag) => {
    const { stage, viewport } = fixture()
    stage.innerHTML = `<svg viewBox="0 0 1000 500"><foreignObject width="200" height="100"><div xmlns="http://www.w3.org/1999/xhtml"><${tag} style="font-size: 8px">Label</${tag}></div></foreignObject></svg>`
    const controller = createDiagramView(viewport, stage)
    controller.reset()
    expect(controller.getState()).toMatchObject({ cameraMode: "readable", scale: 1.75 })
    controller.destroy()
  })

  it("fits very large diagrams below the interactive zoom floor", () => {
    const { stage, viewport } = fixture()
    stage.innerHTML = '<svg viewBox="0 0 5000 500"><text>Wide</text></svg>'
    const onScaleChange = vi.fn()
    const controller = createDiagramView(viewport, stage, { onScaleChange })
    expect(onScaleChange).toHaveBeenLastCalledWith(0.1, 0.1, maxDiagramScale)
    expect(controller.getState()).toMatchObject({ cameraMode: "overview", scale: 0.1 })
    expect(controller.getState().scale).toBeLessThan(minDiagramScale)
    expect(viewport).toHaveAttribute("data-diagram-cropped", "false")

    controller.zoomBy(0.8)
    expect(controller.getState().scale).toBe(0.1)
    expect(viewport).toHaveAttribute("data-diagram-cropped", "false")
    controller.zoomBy(1.25)
    expect(controller.getState().scale).toBe(0.125)
    expect(onScaleChange).toHaveBeenLastCalledWith(0.125, 0.1, maxDiagramScale)
    controller.zoomBy(0.8)
    expect(controller.getState().scale).toBe(0.1)
    controller.reset()
    expect(onScaleChange).toHaveBeenLastCalledWith(1, minDiagramScale, maxDiagramScale)
    controller.destroy()
  })

  it("uses the current fitted scale as the native reset zoom floor", () => {
    const { stage, viewport } = fixture()
    stage.innerHTML = '<svg viewBox="0 0 5000 500"><text style="font-size: 8px">Wide</text></svg>'
    const onScaleChange = vi.fn()
    const controller = createDiagramView(viewport, stage, { resetMode: "native", onScaleChange })
    controller.reset()
    expect(controller.getState()).toMatchObject({ scale: 1, x: -2250, y: -100 })
    controller.zoomBy(0.01)
    expect(onScaleChange).toHaveBeenLastCalledWith(0.1, 0.1, maxDiagramScale)
    Object.defineProperty(viewport, "clientWidth", { value: 600 })
    controller.refresh()
    expect(onScaleChange).toHaveBeenLastCalledWith(0.12, 0.12, maxDiagramScale)
    controller.destroy()
  })

  it("leaves host-managed height alone and fits against the supplied dimensions", () => {
    const { stage, viewport } = fixture()
    viewport.style.height = "200px"
    Object.defineProperty(viewport, "clientHeight", { value: 200 })
    let expanded = false
    const controller = createDiagramView(viewport, stage, {
      manageInlineHeight: false,
      isExpanded: () => expanded,
    })
    expect(viewport.style.height).toBe("200px")
    expect(controller.getState().scale).toBe(0.4)
    expanded = true
    controller.refresh()
    expect(viewport.style.height).toBe("200px")
    controller.destroy()
  })

  it("caps automatic focus scale without capping manual zoom", () => {
    const { stage, viewport } = fixture()
    const controller = createDiagramView(viewport, stage, { focusMaxScale: 2 })
    controller.setFocusRegion({ x: 300, y: 200, width: 50, height: 50 })
    expect(controller.getState().scale).toBe(2)
    controller.zoomBy(2)
    expect(controller.getState().scale).toBe(maxDiagramScale)
    controller.reset()
    expect(controller.getState().scale).toBe(2)
    controller.destroy()
  })

  it("releases a captured drag when the host suspends input and preserves zoom", () => {
    const { stage, viewport } = fixture()
    let enabled = true
    const release = vi.spyOn(viewport, "releasePointerCapture")
    const controller = createDiagramView(viewport, stage, {
      isInteractionEnabled: () => enabled,
    })
    controller.zoomBy(2)
    viewport.dispatchEvent(pointer("pointerdown", 7, 250, 150, "mouse"))
    const before = stage.style.transform
    enabled = false
    controller.refresh()
    expect(release).toHaveBeenCalledWith(7)
    const move = pointer("pointermove", 7, 150, 150, "mouse")
    viewport.dispatchEvent(move)
    const wheel = new WheelEvent("wheel", { cancelable: true, ctrlKey: true, deltaY: -1 })
    viewport.dispatchEvent(wheel)
    const key = new KeyboardEvent("keydown", { cancelable: true, key: "+" })
    viewport.dispatchEvent(key)
    for (const event of [move, wheel, key]) expect(event.defaultPrevented).toBe(false)
    expect(stage.style.transform).toBe(before)
    enabled = true
    controller.refresh()
    expect(stage.style.transform).toBe(before)
    controller.destroy()
  })

  it("bounds zoom and preserves a user-modified scale while refreshing", () => {
    const { stage, viewport } = fixture()
    const controller = createDiagramView(viewport, stage)
    controller.zoomBy(100)
    expect(controller.getState().scale).toBe(maxDiagramScale)
    controller.refresh()
    expect(controller.getState().scale).toBe(maxDiagramScale)
    controller.zoomBy(0.0001)
    expect(controller.getState().scale).toBe(minDiagramScale)
    controller.destroy()
  })

  it("supports keyboard pan, zoom, refit, and removes listeners on destroy", () => {
    const { stage, viewport } = fixture()
    const controller = createDiagramView(viewport, stage)
    viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true }))
    expect(controller.getState().scale).toBeCloseTo(0.625)
    viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
    expect(controller.getState().userModified).toBe(true)
    viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "0", bubbles: true }))
    expect(controller.getState()).toMatchObject({ cameraMode: "overview", scale: 0.5 })

    controller.destroy()
    viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true }))
    expect(controller.getState().scale).toBe(0.5)
  })

  it.each([
    '<input type="range" aria-label="Parameter">',
    '<select aria-label="Parameter"><option>Value</option></select>',
    '<textarea aria-label="Parameter"></textarea>',
    "<button><span>Action</span></button>",
    '<a href="#target"><span>Link</span></a>',
    '<label><span>Parameter</span><input type="range"></label>',
    "<details><summary><span>Options</span></summary></details>",
    '<div contenteditable="true"><span>Editable</span></div>',
    '<div role="slider" tabindex="0"><span>Parameter</span></div>',
  ])("leaves descendant controls to handle their own gestures: %s", (html) => {
    const { stage, viewport } = fixture()
    stage.insertAdjacentHTML("beforeend", html)
    const target = stage.lastElementChild?.querySelector("span") ?? stage.lastElementChild
    if (!target) throw new Error("control missing")
    const capture = vi.spyOn(viewport, "setPointerCapture")
    const controller = createDiagramView(viewport, stage, { isExpanded: () => true })
    controller.reset()
    const before = { ...controller.getState() }

    for (const pointerType of ["mouse", "pen", "touch"]) {
      const down = pointer("pointerdown", 7, 250, 150, pointerType)
      target.dispatchEvent(down)
      const move = pointer("pointermove", 7, 150, 150, pointerType)
      target.dispatchEvent(move)
      target.dispatchEvent(pointer("pointerup", 7, 150, 150, pointerType))
      expect(down.defaultPrevented).toBe(false)
      expect(move.defaultPrevented).toBe(false)
    }
    expect(capture).not.toHaveBeenCalled()

    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "0"]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
      target.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
    for (const modifier of ["ctrlKey", "metaKey"]) {
      const event = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: -1,
        [modifier]: true,
      })
      target.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
    expect(controller.getState()).toEqual(before)
    controller.destroy()
  })

  it.each([true, false])("preserves Escape handling on controls when handled=%s", (handled) => {
    const { stage, viewport } = fixture()
    const input = document.createElement("input")
    stage.append(input)
    const onEscape = vi.fn(() => handled)
    const controller = createDiagramView(viewport, stage, { onEscape })
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    input.dispatchEvent(event)
    expect(onEscape).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(handled)
    controller.destroy()
  })

  it("cleans up cancelled fullscreen touch pointers", () => {
    const { stage, viewport } = fixture()
    const controller = createDiagramView(viewport, stage, { isExpanded: () => true })
    controller.setCameraMode("readable")
    viewport.dispatchEvent(pointer("pointerdown", 7, 250, 150))
    viewport.dispatchEvent(pointer("pointermove", 7, 150, 150))
    const moved = stage.style.transform
    viewport.dispatchEvent(pointer("pointercancel", 7, 150, 150))
    viewport.dispatchEvent(pointer("pointermove", 7, 50, 150))
    expect(stage.style.transform).toBe(moved)
    controller.destroy()
  })

  it("only consumes modified wheel zoom", () => {
    const { stage, viewport } = fixture()
    const controller = createDiagramView(viewport, stage)
    const ordinary = new WheelEvent("wheel", { cancelable: true, deltaY: -1 })
    viewport.dispatchEvent(ordinary)
    expect(ordinary.defaultPrevented).toBe(false)
    const modified = new WheelEvent("wheel", { cancelable: true, ctrlKey: true, deltaY: -1 })
    viewport.dispatchEvent(modified)
    expect(modified.defaultPrevented).toBe(true)
    expect(controller.getState().scale).toBeCloseTo(0.55)
    controller.destroy()
  })
})
