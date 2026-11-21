import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  createContext,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import { createDiagramControllerWithGeometry } from "./core/diagramController.js"
import {
  type DiagramAction,
  type DiagramOptions,
  type DiagramState,
  getDiagramAction,
  initialDiagramState,
} from "./core/index.js"
import { useOverviewThumbnail, ViewerOverview } from "./overview.js"

export type {
  DiagramAction,
  DiagramKeyboardPan,
  DiagramOptions,
  DiagramRegion,
  DiagramState,
} from "./core/index.js"

type ViewerController = ReturnType<typeof createDiagramControllerWithGeometry>

interface DiagramContextValue {
  options: DiagramOptions
  state: Readonly<DiagramState>
  controller: RefObject<ViewerController | undefined>
  root: { current: HTMLDivElement | null }
  viewport: { current: HTMLElement | null }
  stage: { current: HTMLDivElement | null }
  sourceID: string
  graphicName: string
  stageClassName?: string
  hostManaged: boolean
}

const DiagramContext = createContext<DiagramContextValue | undefined>(undefined)

function useDiagramContext() {
  const context = useContext(DiagramContext)
  if (!context) throw new Error("Diagram controls must be inside DiagramRoot.")
  return context
}

export interface DiagramRootProps extends DiagramOptions {
  children: ReactNode
  className?: string
  style?: CSSProperties
  graphicName?: string
  stageClassName?: string
  /** Host owns and finalizes the stage children instead of supplying SVG markup. */
  hostManaged?: boolean
  /** Change after replacing host-owned content when ready stays true. */
  contentVersion?: unknown
}

export function DiagramRoot({
  children,
  className,
  style,
  graphicName = "diagram",
  stageClassName,
  hostManaged = false,
  contentVersion,
  ...options
}: DiagramRootProps) {
  const root = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const controller = useRef<ViewerController | undefined>(undefined)
  const currentOptions = useRef(options)
  currentOptions.current = options
  const sourceID = useId()
  const [state, setState] = useState<Readonly<DiagramState>>(initialDiagramState)

  useEffect(() => {
    if (!root.current || !viewport.current || !stage.current) return
    const instance = createDiagramControllerWithGeometry(
      { root: root.current, viewport: viewport.current, stage: stage.current },
      currentOptions.current,
    )
    controller.current = instance
    const unsubscribe = instance.subscribe(() => setState(instance.getState()))
    setState(instance.getState())
    return () => {
      unsubscribe()
      controller.current = undefined
      instance.destroy()
    }
  }, [])

  // Options are host state, not a second action state owner.
  useEffect(() => controller.current?.update(options))

  // biome-ignore lint/correctness/useExhaustiveDependencies: Refresh after a host DOM replacement even when readiness stays true.
  useEffect(() => {
    if (options.ready !== false) controller.current?.refresh()
  }, [options.ready, options.svg, contentVersion])

  return (
    <DiagramContext.Provider
      value={{
        options,
        state,
        controller,
        root,
        viewport,
        stage,
        sourceID,
        graphicName,
        stageClassName,
        hostManaged,
      }}
    >
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-modal is set only with role=dialog in fallback mode. */}
      <div
        ref={root}
        className={`ndv-root diagram-card${state.fallback ? " diagram-expanded" : ""}${className ? ` ${className}` : ""}`}
        style={style}
        aria-busy={options.ready === false || options.refreshing === true}
        role={state.fallback ? "dialog" : undefined}
        aria-modal={state.fallback ? true : undefined}
        aria-label={state.fallback ? graphicName : undefined}
      >
        {children}
      </div>
    </DiagramContext.Provider>
  )
}

/** A native control group: Tab follows DOM order, including app-specific controls. */
export function DiagramToolbar({ className, ...props }: HTMLAttributes<HTMLFieldSetElement>) {
  return (
    <fieldset
      {...props}
      aria-label={props["aria-label"] ?? "Diagram controls"}
      className={`ndv-toolbar diagram-controls${className ? ` ${className}` : ""}`}
    />
  )
}

export function useDiagramState() {
  return useDiagramContext().state
}

/** Spread these props onto a native button; do not replace its handler or state. */
export function useDiagramAction(action: DiagramAction): ButtonHTMLAttributes<HTMLButtonElement> {
  const { state, options, controller, sourceID } = useDiagramContext()
  const binding = getDiagramAction(state, options, action)
  return {
    type: "button",
    "aria-label": binding.label,
    disabled: binding.disabled,
    "aria-pressed": binding.pressed,
    "aria-busy": binding.busy || undefined,
    "aria-controls": action === "source" ? sourceID : undefined,
    onClick: () => {
      void controller.current?.run(action)
    },
  }
}

const iconPaths: Record<DiagramAction, string> = {
  zoomOut: "M3 8h10",
  zoomIn: "M3 8h10M8 3v10",
  fit: "M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4",
  reset: "M3 5a6 6 0 1 1-1 5M3 1v4h4",
  fullscreen: "M6 2H2v4M10 2h4v4M14 10v4h-4M6 14H2v-4",
  source: "m5 4-4 4 4 4m6-8 4 4-4 4M9 2 7 14",
  copy: "M6 2h8v9H6zM3 5H2v9h8v-1",
  svg: "M8 1v9m-4-4 4 4 4-4M2 11v3h12v-3",
  png: "M2 2h12v12H2zM2 12l4-5 3 4 2-2 3 3M11 5h.01",
  retry: "M13 5a6 6 0 1 0 1 5M13 1v4H9",
}

export interface DiagramActionProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "onClick" | "disabled" | "aria-pressed" | "aria-busy" | "aria-controls"
  > {
  action: DiagramAction
}

export function DiagramActionButton({
  action,
  children,
  "aria-label": label,
  ...props
}: DiagramActionProps) {
  const binding = useDiagramAction(action)
  return (
    <ControlButton {...props} {...binding} aria-label={label ?? binding["aria-label"]}>
      {children ?? <ControlIcon path={iconPaths[action]} />}
    </ControlButton>
  )
}

function ControlIcon({ path }: { path: string }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  )
}

function ControlButton({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> }) {
  const tooltipID = useId()
  const [tooltip, setTooltip] = useState(false)
  const name = props["aria-label"]
  return (
    <span className="ndv-control-wrap">
      <button
        {...props}
        aria-describedby={tooltip ? tooltipID : undefined}
        className={`ndv-control diagram-control${className ? ` ${className}` : ""}`}
        onFocus={(event) => {
          setTooltip(true)
          props.onFocus?.(event)
        }}
        onBlur={(event) => {
          setTooltip(false)
          props.onBlur?.(event)
        }}
        onPointerEnter={(event) => {
          setTooltip(true)
          props.onPointerEnter?.(event)
        }}
        onPointerLeave={(event) => {
          setTooltip(false)
          props.onPointerLeave?.(event)
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setTooltip(false)
          props.onKeyDown?.(event)
        }}
      >
        {children}
      </button>
      {tooltip && !props.disabled && (
        <span className="ndv-tooltip" id={tooltipID} role="tooltip">
          {name}
        </span>
      )}
    </span>
  )
}

export function DiagramZoom() {
  const { scale } = useDiagramState()
  return <output aria-label="Current zoom">{Math.round(scale * 100)}%</output>
}

export function DiagramDefaultToolbar() {
  const { options } = useDiagramContext()
  return (
    <DiagramToolbar>
      <DiagramActionButton action="zoomOut" />
      <DiagramZoom />
      <DiagramActionButton action="zoomIn" />
      <DiagramActionButton action="fit" />
      <DiagramActionButton action="reset" />
      <DiagramActionButton action="fullscreen" />
      <DiagramActionButton action="source" />
      <DiagramActionButton action="copy" />
      <DiagramActionButton action="svg" />
      <DiagramActionButton action="png" />
      {options.renderError && options.retryRender && <DiagramActionButton action="retry" />}
    </DiagramToolbar>
  )
}

export interface DiagramViewportProps {
  className?: string
  stageRef?: Ref<HTMLDivElement>
}

export function DiagramViewport({ className, stageRef }: DiagramViewportProps) {
  const { options, state, viewport, stage, graphicName, stageClassName, hostManaged } =
    useDiagramContext()
  const setStage = useCallback(
    (element: HTMLDivElement | null) => {
      stage.current = element
      if (typeof stageRef === "function") return stageRef(element)
      if (stageRef) stageRef.current = element
    },
    [stage, stageRef],
  )
  const panKeys = options.keyboardPan === "shift-arrows" ? "Shift + arrow keys" : "arrow keys"
  return (
    <section
      ref={viewport}
      className={`ndv-viewport diagram-viewport${className ? ` ${className}` : ""}`}
      hidden={state.showSource}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: This viewport has scoped keyboard pan and zoom controls.
      tabIndex={0}
      aria-label={`Interactive ${graphicName}. Use ${panKeys} to pan, plus or minus to zoom, and zero to fit.`}
    >
      <div
        ref={setStage}
        className={`ndv-stage${hostManaged ? " ndv-host-stage" : " ndv-svg"}${stageClassName ? ` ${stageClassName}` : ""}`}
        {...(hostManaged ? {} : { role: "img", "aria-label": graphicName })}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Public API requires trusted or host-sanitized SVG. Host-managed children are never passed to React.
        dangerouslySetInnerHTML={!hostManaged && options.svg ? { __html: options.svg } : undefined}
      />
      {options.ready === false && (
        <div className="ndv-loading" role="status" aria-label={`Rendering ${graphicName}`} />
      )}
    </section>
  )
}

export function DiagramSource({ className }: { className?: string }) {
  const { options, state, sourceID } = useDiagramContext()
  return (
    // biome-ignore lint/a11y/useSemanticElements: A named scrollable pre preserves code layout and accessibility.
    <pre
      id={sourceID}
      className={`ndv-source${className ? ` ${className}` : ""}`}
      hidden={!state.showSource}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: A scrollable source region must be keyboard reachable.
      tabIndex={0}
      role="region"
      aria-label="Diagram source"
    >
      <code>{options.source}</code>
    </pre>
  )
}

export function DiagramStatus() {
  const { options, state } = useDiagramContext()
  const status = options.refreshing
    ? `Refreshing ${options.typeLabel ?? "diagram"}…`
    : options.renderError || state.status
  return (
    <div className="ndv-status diagram-status" role="status" aria-live="polite">
      {status}
    </div>
  )
}

export function DiagramPanHint() {
  const { options, state } = useDiagramContext()
  if (!state.cropped || state.showSource) return null
  const panKeys = options.keyboardPan === "shift-arrows" ? "Shift + arrow keys" : "arrow keys"
  return (
    <p className="ndv-pan-hint diagram-pan-hint">
      {`Drag or use ${panKeys} to pan.${state.expanded ? " Use two fingers to pan and zoom." : ""}`}
    </p>
  )
}

export interface DiagramViewerProps extends Omit<DiagramRootProps, "children"> {
  stageRef?: Ref<HTMLDivElement>
  toolbar?: "classic" | "grouped" | "canvas"
  /** Control placement in the canvas preset only. */
  canvasControls?: "docked" | "floating"
  /** Offer an initially closed Overview for usable SVGs. Defaults to true in the canvas preset only. */
  overview?: boolean
  buttonDisplay?: "icon" | "icon-and-text"
}

export function DiagramViewer({
  stageRef,
  toolbar = "canvas",
  canvasControls = "floating",
  overview = toolbar === "canvas",
  buttonDisplay = "icon",
  className,
  ...props
}: DiagramViewerProps) {
  const classes = [className]
  if (toolbar !== "classic" || overview || buttonDisplay !== "icon") classes.push("ndv-viewer-alt")
  if (toolbar === "canvas") {
    classes.push("ndv-canvas")
    if (canvasControls === "floating") classes.push("ndv-floating")
  }
  return (
    <DiagramRoot {...props} className={classes.filter(Boolean).join(" ")}>
      <ViewerContent
        stageRef={stageRef}
        toolbar={toolbar}
        overview={overview}
        labels={buttonDisplay === "icon-and-text"}
      />
    </DiagramRoot>
  )
}

function PresetButton({
  action,
  labels,
  distinctFit,
}: {
  action: DiagramAction
  labels: boolean
  distinctFit: boolean
}) {
  const binding = useDiagramAction(action)
  const path = distinctFit && action === "fit" ? "M2 2h12v12H2zM5 6h6v4H5z" : iconPaths[action]
  return (
    <ControlButton {...binding} className={labels ? "ndv-labeled-button" : undefined}>
      <ControlIcon path={path} />
      {labels && binding["aria-label"]}
    </ControlButton>
  )
}

function ViewerContent({
  stageRef,
  toolbar,
  overview,
  labels,
}: {
  stageRef?: Ref<HTMLDivElement>
  toolbar: NonNullable<DiagramViewerProps["toolbar"]>
  overview: boolean
  labels: boolean
}) {
  const { controller, options, state, stage, viewport, hostManaged, graphicName } =
    useDiagramContext()
  const thumbnail = useOverviewThumbnail(overview && !hostManaged ? options.svg : undefined, stage)
  const overviewID = useId()
  const [open, setOpen] = useState(false)
  const subscribe = useCallback<ViewerController["subscribeVisibleRegion"]>(
    (listener) => controller.current?.subscribeVisibleRegion(listener) ?? (() => {}),
    [controller],
  )
  const returnFocus = useCallback(
    (button: HTMLButtonElement | null) => {
      if (!button) return
      return () => {
        const target = viewport.current
        if (
          button.ownerDocument.activeElement === button &&
          target?.isConnected &&
          !target.hidden
        ) {
          target.focus({ preventScroll: true })
        }
      }
    },
    [viewport],
  )
  const available =
    thumbnail && !state.showSource && options.ready !== false && !options.renderError
  const canvas = toolbar === "canvas"
  const action = (action: DiagramAction) => (
    <PresetButton
      key={action}
      action={action}
      labels={labels}
      distinctFit={toolbar !== "classic"}
    />
  )
  const camera = (
    <>
      {action("zoomOut")}
      <DiagramZoom />
      {action("zoomIn")}
      {action("fit")}
      {action("reset")}
      {action("fullscreen")}
      {available && (
        <ControlButton
          ref={returnFocus}
          type="button"
          className={labels ? "ndv-labeled-button" : undefined}
          aria-label="Overview"
          aria-controls={overviewID}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ControlIcon path="m1.5 4 4.25-2 4.5 2 4.25-2v10l-4.25 2-4.5-2-4.25 2zM5.75 2v10m4.5-8v10" />
          {labels && "Overview"}
        </ControlButton>
      )}
    </>
  )
  const source = (
    <>
      {action("source")}
      {action("copy")}
    </>
  )
  const exports = (
    <>
      {action("svg")}
      {action("png")}
      {options.renderError && options.retryRender && action("retry")}
    </>
  )
  const sourceView = <DiagramSource key="source" />
  const lowerControls = canvas ? (
    <div className="ndv-canvas-controls" key="controls">
      <DiagramPanHint />
      <DiagramToolbar className="ndv-camera" aria-label="Diagram view controls">
        {camera}
      </DiagramToolbar>
    </div>
  ) : (
    <DiagramPanHint key="controls" />
  )
  return (
    <>
      <DiagramToolbar
        className={toolbar === "classic" ? undefined : "ndv-grouped-toolbar"}
        aria-label={canvas ? "Diagram file controls" : undefined}
      >
        {toolbar === "classic" ? (
          <>
            {camera}
            {source}
            {exports}
          </>
        ) : (
          <>
            {canvas && graphicName !== "diagram" && (
              <span className="ndv-viewer-heading">
                <strong>{graphicName}</strong>
                {options.typeLabel && <small>{options.typeLabel}</small>}
              </span>
            )}
            {!canvas && <div className="ndv-control-group">{camera}</div>}
            <div className="ndv-control-group">{source}</div>
            <div className="ndv-control-group">{exports}</div>
          </>
        )}
      </DiagramToolbar>
      <DiagramViewport stageRef={stageRef} />
      {available && (
        <ViewerOverview id={overviewID} thumbnail={thumbnail} open={open} subscribe={subscribe} />
      )}
      {canvas ? [sourceView, lowerControls] : [lowerControls, sourceView]}
      <DiagramStatus />
    </>
  )
}
