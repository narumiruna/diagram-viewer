import { DiagramViewer, type DiagramViewerProps } from "@narumitw/diagram-viewer"
import "@narumitw/diagram-viewer/styles.css"
import { useSyncExternalStore } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import svg from "./diagram.svg?raw"

const source = `flowchart LR
  browser[Browser] --> cache[Cache] --> api[API]
  cache --> storage[Storage]`

type Settings = Pick<
  DiagramViewerProps,
  "toolbar" | "canvasControls" | "buttonDisplay" | "overview"
>
type Example = { label: string; caption: string; settings: Settings }
type Comparison = { id: string; examples: Example[] }

const touchInput = window.matchMedia("(hover: none)")
function subscribeToTouchInput(listener: () => void) {
  touchInput.addEventListener("change", listener)
  return () => touchInput.removeEventListener("change", listener)
}

const comparisons: Comparison[] = [
  {
    id: "toolbar",
    examples: [
      {
        label: "Classic",
        caption: "All actions sit above the diagram.",
        settings: { toolbar: "classic", overview: false },
      },
      {
        label: "Grouped",
        caption: "Related actions are grouped together above the diagram.",
        settings: { toolbar: "grouped", overview: false },
      },
      {
        label: "Canvas",
        caption: "File actions stay at the top. View controls move below the diagram.",
        settings: { toolbar: "canvas", overview: false },
      },
    ],
  },
  {
    id: "canvas-controls",
    examples: [
      {
        label: "Docked",
        caption: "A full-width bar holds the view controls below the canvas.",
        settings: { toolbar: "canvas", canvasControls: "docked", overview: false },
      },
      {
        label: "Floating",
        caption: "On a wide canvas, the pan hint and view controls sit in opposite corners.",
        settings: { toolbar: "canvas", canvasControls: "floating", overview: false },
      },
    ],
  },
  {
    id: "button-display",
    examples: [
      {
        label: "Icons",
        caption: "Hover or focus a button to see its label.",
        settings: { toolbar: "grouped", buttonDisplay: "icon" },
      },
      {
        label: "Icons and text",
        caption: "The same actions have visible labels.",
        settings: { toolbar: "grouped", buttonDisplay: "icon-and-text" },
      },
    ],
  },
  {
    id: "overview",
    examples: [
      {
        label: "Overview off",
        caption: "The view controls have no Overview button.",
        settings: {
          toolbar: "canvas",
          canvasControls: "docked",
          buttonDisplay: "icon-and-text",
          overview: false,
        },
      },
      {
        label: "Overview on",
        caption: "An Overview button opens the thumbnail.",
        settings: {
          toolbar: "canvas",
          canvasControls: "docked",
          buttonDisplay: "icon-and-text",
          overview: true,
        },
      },
    ],
  },
]

function Preview({ example, id, touch }: { example: Example; id: string; touch: boolean }) {
  const props = Object.entries(example.settings).map(([name, value]) =>
    typeof value === "boolean" ? `${name}={${value}}` : `${name}="${value}"`,
  )
  return (
    <article className="example" aria-labelledby={id}>
      <h4 id={id}>{example.label}</h4>
      <p>
        {touch && example.settings.buttonDisplay === "icon"
          ? "This demo shows labels on touch screens so you can identify actions before tapping."
          : example.caption}
      </p>
      <DiagramViewer
        source={source}
        svg={svg}
        {...example.settings}
        buttonDisplay={touch ? "icon-and-text" : example.settings.buttonDisplay}
        viewportLabelledBy={id}
      />
      <details className="example-code">
        <summary>View JSX</summary>
        <pre>
          <code>{`<DiagramViewer\n  source={source}\n  svg={svg}\n  ${props.join("\n  ")}\n/>`}</code>
        </pre>
      </details>
    </article>
  )
}

function ComparisonExamples({ id, examples }: Comparison) {
  const touch = useSyncExternalStore(subscribeToTouchInput, () => touchInput.matches)
  return (
    <>
      <div className="comparison-grid">
        {examples.map((example, index) => (
          <Preview example={example} id={`${id}-${index + 1}`} key={example.label} touch={touch} />
        ))}
      </div>
      {id === "canvas-controls" && (
        <figure className="wide-reference">
          <figcaption>What Docked and Floating look like on a wide canvas</figcaption>
          <img
            src={`${import.meta.env.BASE_URL}canvas-controls-wide.png`}
            alt="Wide viewers show Docked as one bottom bar and Floating as separate controls and a pan hint in opposite corners."
            width={656}
            height={218}
            loading="lazy"
          />
        </figure>
      )}
    </>
  )
}

flushSync(() => {
  for (const comparison of comparisons) {
    const mount = document.getElementById(`${comparison.id}-examples`)
    if (mount) createRoot(mount).render(<ComparisonExamples {...comparison} />)
  }
})

// The static targets can move when the diagrams above them mount.
requestAnimationFrame(() => document.querySelector("main :target")?.scrollIntoView())
