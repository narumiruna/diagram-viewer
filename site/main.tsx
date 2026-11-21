import { DiagramViewer, type DiagramViewerProps } from "@narumitw/diagram-viewer"
import "@narumitw/diagram-viewer/styles.css"
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
type Comparison = { id: string; title: string; note?: string; examples: Example[] }

const comparisons: Comparison[] = [
  {
    id: "toolbar",
    title: "Toolbar layout",
    note: "Overview is off in all three examples to isolate the layout. Canvas normally offers it.",
    examples: [
      {
        label: "Classic",
        caption: "All actions share one toolbar above the diagram.",
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
    title: "Canvas control placement",
    note: "This setting applies only to Canvas. On narrow viewers both options use a full-width bottom bar.",
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
    title: "Button labels",
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
    title: "Overview map",
    note: "In the enabled example, open Overview and zoom in to see the frame track the visible area.",
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

function Preview({ example, id }: { example: Example; id: string }) {
  const props = Object.entries(example.settings).map(([name, value]) =>
    typeof value === "boolean" ? `${name}={${value}}` : `${name}="${value}"`,
  )
  return (
    <article className="example" aria-labelledby={id}>
      <h4 id={id}>{example.label}</h4>
      <p>{example.caption}</p>
      <pre>
        <code>{`<DiagramViewer\n  source={source}\n  svg={svg}\n  ${props.join("\n  ")}\n/>`}</code>
      </pre>
      <DiagramViewer source={source} svg={svg} {...example.settings} />
    </article>
  )
}

function Comparisons() {
  return comparisons.map(({ id, title, note, examples }) => (
    <section className="comparison" key={id} id={id} aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{title}</h3>
      {note && <p className="section-intro">{note}</p>}
      <div className="comparison-grid">
        {examples.map((example, index) => (
          <Preview example={example} id={`${id}-${index + 1}`} key={example.label} />
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
    </section>
  ))
}

const examples = document.getElementById("examples")
if (examples) createRoot(examples).render(<Comparisons />)
