import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { DiagramViewer } from "./index.js"

const svg = '<svg viewBox="20 30 100 50"><rect x="20" y="30" width="100" height="50"/></svg>'
const replacement = '<svg viewBox="0 0 120 60"><text>Replacement</text></svg>'
const controls = [
  "Zoom out",
  "Zoom in",
  "Fit to screen",
  "Reset zoom",
  "Fullscreen",
  "Show source",
  "Copy source",
  "Download SVG",
  "Download PNG",
]

function mockThumbnails() {
  const images: HTMLImageElement[] = []
  let nextURL = 0
  const create = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:test-${++nextURL}`)
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
  vi.stubGlobal("Image", function mockImage() {
    const image = document.createElement("img")
    Object.defineProperties(image, { naturalWidth: { value: 100 }, naturalHeight: { value: 50 } })
    images.push(image)
    return image
  })
  return { images, create, revoke }
}

describe("viewer presets", () => {
  it("keeps the original controls and stage when defaults are explicit", () => {
    const { container, rerender } = render(<DiagramViewer source="test" svg={svg} />)
    const original = container.innerHTML
    const stage = container.querySelector(".ndv-stage")
    expect(
      screen.getAllByRole("button").map((button) => button.getAttribute("aria-label")),
    ).toEqual(controls)
    rerender(
      <DiagramViewer
        source="test"
        svg={svg}
        toolbar="default"
        buttonDisplay="icon"
        overview={false}
      />,
    )
    expect(container.innerHTML).toBe(original)
    expect(container.querySelector(".ndv-stage")).toBe(stage)
    expect(screen.queryByRole("button", { name: "Overview" })).not.toBeInTheDocument()
  })

  it.each(["default", "grouped", "canvas"] as const)(
    "shares actions and label display in the %s preset",
    (toolbar) => {
      const retry = vi.fn()
      const props = {
        source: "test",
        svg,
        toolbar,
        renderError: "Failed to render.",
        retryRender: retry,
      }
      const { rerender } = render(<DiagramViewer {...props} />)
      for (const name of [...controls, "Retry diagram"]) {
        const button = screen.getByRole("button", { name })
        expect(button.textContent).toBe("")
        expect(button.querySelector("svg")).not.toBeNull()
      }
      const fit = screen.getByRole("button", { name: "Fit to screen" })
      const fullscreen = screen.getByRole("button", { name: "Fullscreen" })
      if (toolbar !== "default")
        expect(fit.querySelector("path")?.getAttribute("d")).not.toBe(
          fullscreen.querySelector("path")?.getAttribute("d"),
        )
      fireEvent.pointerEnter(fit)
      expect(screen.getByRole("tooltip")).toHaveTextContent("Fit to screen")
      fireEvent.pointerLeave(fit)
      fireEvent.focus(fit)
      expect(screen.getByRole("tooltip")).toHaveTextContent("Fit to screen")
      fireEvent.blur(fit)
      fireEvent.click(screen.getByRole("button", { name: "Retry diagram" }))
      expect(retry).toHaveBeenCalledOnce()
      rerender(<DiagramViewer {...props} buttonDisplay="icon-and-text" />)
      for (const name of [...controls, "Retry diagram"]) {
        const button = screen.getByRole("button", { name })
        expect(button).toHaveTextContent(name)
        expect(button.querySelector("svg")).not.toBeNull()
      }
      fireEvent.click(screen.getByRole("button", { name: "Show source" }))
      expect(screen.getByRole("button", { name: "Show diagram" })).toHaveTextContent("Show diagram")
      expect(screen.getByRole("region", { name: "Diagram source" })).toHaveTextContent("test")
    },
  )

  it("keeps the stage through layouts and restores open Overview after source mode", async () => {
    const { images, create } = mockThumbnails()
    const props = { source: "test", svg, overview: true }
    const { container, rerender } = render(<DiagramViewer {...props} />)
    const stage = container.querySelector(".ndv-stage")
    act(() => images[0]?.dispatchEvent(new Event("load")))
    const toggle = screen.getByRole("button", { name: "Overview" })
    const overviewId = toggle.getAttribute("aria-controls")
    expect(overviewId && document.getElementById(overviewId)).not.toBeVisible()
    toggle.focus()
    fireEvent.click(toggle)
    expect(toggle).toHaveFocus()
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("complementary", { name: "Overview" })).toBeVisible()
    rerender(
      <DiagramViewer
        {...props}
        toolbar="canvas"
        canvasControls="floating"
        buttonDisplay="icon-and-text"
      />,
    )
    expect(container.querySelector(".ndv-stage")).toBe(stage)
    expect(
      within(container.querySelector(".ndv-camera") as HTMLElement).getByRole("button", {
        name: "Overview",
      }),
    ).toHaveTextContent("Overview")
    fireEvent.click(screen.getByRole("button", { name: "Show source" }))
    expect(screen.queryByRole("button", { name: "Overview" })).toBeNull()
    expect(screen.queryByRole("complementary", { name: "Overview" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Show diagram" }))
    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute(
      "aria-expanded",
      "true",
    )
    expect(container.querySelector(".ndv-stage")).toBe(stage)
    expect(create).toHaveBeenCalledOnce()
  })

  it("restores viewport focus and releases stale or failed thumbnails", () => {
    const { images, revoke } = mockThumbnails()
    const { rerender, unmount } = render(<DiagramViewer source="test" svg={svg} overview />)
    expect(screen.queryByRole("button", { name: "Overview" })).toBeNull()
    act(() => images[0]?.dispatchEvent(new Event("load")))
    const toggle = screen.getByRole("button", { name: "Overview" })
    toggle.focus()
    fireEvent.click(toggle)
    rerender(<DiagramViewer source="test" svg={replacement} overview />)
    expect(screen.queryByRole("button", { name: "Overview" })).toBeNull()
    expect(screen.getByRole("region", { name: /^Interactive/ })).toHaveFocus()
    expect(revoke).toHaveBeenCalledWith("blob:test-1")
    act(() => images[0]?.dispatchEvent(new Event("load")))
    expect(screen.queryByRole("button", { name: "Overview" })).toBeNull()
    act(() => images[1]?.dispatchEvent(new Event("error")))
    expect(revoke).toHaveBeenCalledWith("blob:test-2")
    expect(screen.queryByRole("button", { name: "Overview" })).toBeNull()
    unmount()
    expect(revoke).toHaveBeenCalledTimes(2)
  })

  it("does not offer Overview for host-managed stages or disabled rendering", () => {
    const { images, create } = mockThumbnails()
    const { rerender } = render(<DiagramViewer source="test" svg={svg} hostManaged overview />)
    expect(create).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Overview" })).toBeNull()
    rerender(<DiagramViewer source="test" svg={svg} ready={false} overview />)
    act(() => images[0]?.dispatchEvent(new Event("load")))
    expect(screen.queryByRole("button", { name: "Overview" })).toBeNull()
    rerender(<DiagramViewer source="test" svg={svg} ready overview />)
    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute(
      "aria-expanded",
      "false",
    )
  })
})
