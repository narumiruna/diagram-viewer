# @narumitw/diagram-viewer

React diagram frame, composable controls, and browser-only core. It has no
Mermaid, Vega, Radix, or Morsel runtime dependency. Rendering stays in the host.
The verified React and React DOM version is **19.3.1**. License: [MIT](LICENSE).

The [project site](https://narumiruna.github.io/diagram-viewer/) previews the
main branch. It can show settings that are not in the latest npm release. See
the [release notes](CHANGELOG.md) for available features.

## Install

```sh
npm install @narumitw/diagram-viewer
```

The package is public on npm. The verified React and React DOM version is
19.3.1. The host still owns rendering and SVG sanitation.

## Use the React viewer

Import the stylesheet explicitly. Supply trusted or sanitized SVG, not arbitrary
author HTML:

```tsx
import { DiagramViewer } from "@narumitw/diagram-viewer"
import "@narumitw/diagram-viewer/styles.css"

const svg = '<svg viewBox="0 0 100 50"><text x="5" y="20">Example</text></svg>'

export function Example() {
  return (
    <DiagramViewer
      source="graph TD; A-->B"
      svg={svg}
      graphicName="Example diagram"
      filename="example"
      background="#ffffff"
    />
  )
}
```

The canvas layout is the default. It puts source and export controls at the
top and view controls at the bottom. A retry button appears only when both
`renderError` and `retryRender` are supplied.

### Choose a layout

The React `DiagramViewer` accepts these presentation options:

| Prop | Values | Default | Behavior |
| --- | --- | --- | --- |
| `toolbar` | `"classic"`, `"grouped"`, `"canvas"` | `"canvas"` | Use the original toolbar, group actions at the top, or place view controls and the pan hint at the bottom of a dotted canvas. |
| `canvasControls` | `"docked"`, `"floating"` | `"floating"` | Only for the canvas preset. Use a full-width bottom bar or float the hint and controls at the bottom corners. Narrow viewers use the bottom bar. |
| `buttonDisplay` | `"icon"`, `"icon-and-text"` | `"icon"` | Change all built-in Viewer buttons, including Overview. Icon-only buttons keep accessible names and pointer/keyboard tooltips. |
| `overview` | `false`, `true` | `true` for `"canvas"`; `false` otherwise | Add an initially closed Overview next to the view controls in any preset, if a thumbnail is available. |

When a page has several viewers, give each viewport a distinct accessible name.
Set `viewportLabelledBy` to the ID of an existing heading or label. When
composing controls, set `aria-labelledby` on `DiagramViewport` instead. If you
omit the reference, the viewport uses `graphicName` in its name. Keyboard
shortcuts are exposed as a separate accessible description.

```tsx
// Keep the original interface when upgrading from 0.4 or earlier.
<DiagramViewer source={source} svg={svg} toolbar="classic" />
```

Overview is a read-only thumbnail. Its frame shows the part of the diagram
visible in the canvas. Use the same Overview button to open and close it.
The panel sits beside the canvas on wider viewers and below it when space is
limited. Switching to source hides the map and keeps its open state for when
you return. Overview requires an SVG with a usable `viewBox`. It is not
available in `hostManaged` mode. The thumbnail is a separate image; it does not
inherit page styles and may be unavailable if the browser blocks blob images.

Existing calls without `toolbar` now use the canvas layout. Select
`toolbar="classic"` to restore the original icon-only top toolbar, including
its original control order, without adding an Overview button. These options
do not affect custom controls composed with `DiagramRoot`.

## Compose controls

Select and order actions through children, not a configuration array. This
example omits the download actions, replaces a built-in icon, and uses an app
button with the same action/state rules:

```tsx
import {
  DiagramActionButton, DiagramRoot, DiagramSource, DiagramStatus,
  DiagramToolbar, DiagramViewport, DiagramZoom, useDiagramAction,
} from "@narumitw/diagram-viewer"

function AppZoomButton() {
  const binding = useDiagramAction("zoomIn")
  return <button {...binding} className="app-zoom"><span aria-hidden="true">+</span></button>
}

export function Composed({ source, svg }: { source: string; svg: string }) {
  return (
    <DiagramRoot source={source} svg={svg}>
      <DiagramToolbar>
        <DiagramActionButton action="source">Source</DiagramActionButton>
        <AppZoomButton />
        <DiagramZoom />
        <button type="button" onClick={() => console.log("app action")}>App action</button>
      </DiagramToolbar>
      <DiagramViewport />
      <DiagramSource />
      <DiagramStatus />
    </DiagramRoot>
  )
}
```

Keep exactly one viewport and source view mounted in each root. Include
`DiagramStatus` for polite action feedback and optionally `DiagramPanHint` for
cropping instructions. `DiagramDefaultToolbar` can be used in a composed root. It still renders the
classic top toolbar.
`DiagramToolbar` is a native fieldset, not an ARIA toolbar: Tab follows DOM order,
including custom controls. Arrow keys are camera shortcuts only on the viewport,
not on toolbar controls, editable elements, source, or live chart inputs.

`useDiagramAction(action)` returns native button props: `type`, `onClick`,
`disabled`, accessible name, busy state, and applicable toggle/control state.
Spread them onto a native button; do not replace its handler or state. A custom
visible label must also set a matching accessible name. `DiagramActionButton`
accepts children, an `aria-label`, a scoped class, and button presentation props.
Do not replace its built-in handler. Actions are:

```text
zoomOut zoomIn fit reset fullscreen source copy svg png retry
```

`useDiagramState()` exposes an immutable snapshot with exact scale bounds,
cropping, focus-region availability, source visibility, fullscreen/fallback
state, async action flags, and status. It observes the same core controller
used by all buttons. Zoom labels are rounded for display; disabled bounds use
the exact values.

## Slide focus and keyboard controls

Pass a `focusRegion` to `DiagramViewer` or `DiagramRoot` to zoom in on a
rectangle over the same SVG. The host maps nodes to the rectangle. Use CSS
pixels in the unscaled stage, measured from its top-left corner, not screen
coordinates or an SVG's nonzero `viewBox` origin.

```tsx
<DiagramViewer
  source={source}
  svg={sanitizedSvg}
  focusRegion={activeSlide.region}
  keyboardPan="shift-arrows"
/>
```

- Changing the rectangle opens its detail view without replacing the SVG.
  Omit it on overview slides. A rectangle outside the SVG or with invalid
  dimensions falls back to the overview.
- **Fit to screen** shows the whole SVG and keeps the frame. **Reset to slide
  focus** restores the detail view. Without a region, **Reset zoom** still
  selects the readable scale.
- `keyboardPan="shift-arrows"` makes Shift + arrow keys pan the focused
  viewport. Plain arrows remain available to the host for slide navigation.
  The default still pans with plain arrows. In either mode, `+` and `-` zoom
  and `0` fits the diagram. Camera shortcuts do not take over nested controls.

The framework-independent controller accepts the same options in
`createDiagramController()` and `update()`. Call `camera.setFocusRegion(rect)`
when using the lower-level `createDiagramView()` directly.
`camera.setFocusRegion()` clears the rectangle; `getKeyboardPan` can return
`"shift-arrows"` for a host-owned viewport. The core sets
`data-ndv-focus-region` and the `--ndv-region-{x,y,width,height}` custom
properties on the stage while a valid rectangle is available. The package
stylesheet draws the frame on `.ndv-stage`; hosts with their own styles can
use these attributes to draw it themselves.

## Host-owned chart mount

Use `hostManaged` when an imperative renderer owns the children. React never
updates those children. The host must finalize its renderer and remove its own
mount during cleanup:

```tsx
import { useEffect, useRef, useState } from "react"
import { DiagramViewer } from "@narumitw/diagram-viewer"

export function HostChart({ source }: { source: string }) {
  const stage = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const target = stage.current
    if (!target) return
    setReady(false)
    const mount = document.createElement("div")
    target.append(mount)
    // Replace with your local renderer. Never insert unsanitized author HTML.
    mount.innerHTML = '<svg viewBox="0 0 100 50"><text y="20">Chart</text></svg>'
    setReady(true)
    return () => mount.remove() // Also finalize your renderer here.
  }, [source])
  return <DiagramViewer source={source} hostManaged stageRef={stage} ready={ready} />
}
```

`ready: false` ends active camera gestures and disables camera/export actions
but keeps source access. Set it to true after rendering. For replacements while
`ready` remains true, change `contentVersion` after the DOM update; this refreshes
the camera. Changing `svg` also refreshes the camera. Opening source mode ends
active camera gestures. Source mode and fullscreen retain the same SVG and host
mount. `refreshing`, `renderError`, and `retryRender` are host-owned render state;
retry execution is not a renderer plugin system.

When keeping a previous successful SVG during refresh, keep its export
`background` paired with it until a new render succeeds. `background` affects
PNG export, not CSS. `filename`, `graphicName`, `typeLabel` (such as `chart`),
`stageClassName`, and `className` let the host supply wording and presentation.

## Styles and accessibility

All default CSS is scoped to `ndv-` classes. Root CSS variables are
`--ndv-background`, `--ndv-foreground`, `--ndv-border`, `--ndv-control`,
`--ndv-radius`, and `--ndv-focus`. Set them on the root with `style`, or override
them in a stylesheet loaded after the package CSS. Choose foreground/background
pairs with sufficient contrast. No theme provider is needed.

Buttons have accessible names, visible focus, 44-pixel default targets, and
keyboard/pointer tooltips inside the viewer, including fullscreen. Source is a
named, keyboard-scrollable text region. Copy and export results use polite
status feedback. Inline touch scrolls the page; expanded touch pans/pinches.
Fit selects an overview; reset returns to the focus region or selects a readable
scale if no region is set.

Fullscreen keeps the live DOM node. If the native API fails, the existing
in-place fallback isolates background siblings with `inert`, locks scroll
containers, and restores each affected inline axis declaration and its priority
on exit or unmount. It also returns focus to the opener. Escape and the fullscreen
button close fallback mode. A failed or late native request cannot reopen the
fallback after destruction.

## Framework-independent core

```ts
import { createDiagramController } from "@narumitw/diagram-viewer/core"

const controller = createDiagramController(
  { root, viewport, stage }, // mounted host DOM elements
  { source: "graph TD; A-->B", background: "#ffffff", filename: "diagram" },
)
const unsubscribe = controller.subscribe(() => console.log(controller.getState()))
controller.run("fit")
controller.update({ source: "new source", ready: true }) // full option replacement
controller.refresh() // after imperative stage changes
unsubscribe()
controller.destroy() // on unmount; releases listeners, gestures, and fullscreen
```

The core has no React or renderer imports and no import-time browser access. It
can be imported in Node.js; creating an instance, exports, clipboard, and
fullscreen require mounted browser DOM and supported browser APIs. The core
never populates the stage: the host owns its content. Use `getAction(action)`
for framework-independent accessible names and exact disabled/busy/toggle state.
Camera primitives, `createPngExport`, `serializeDiagramSvg`, and
`downloadDiagram` are also exported from `/core`. SVG serialization and PNG
helpers accept an explicit background color, defaulting to white.

### Host-owned selectable nodes and camera

Use `createDiagramView` when the host already owns its toolbar, fullscreen, and
SVG lifecycle. The primitive does not require React or the package stylesheet:

```ts
import { createDiagramView } from "@narumitw/diagram-viewer/core"

// The host selects which SVG nodes are actions and supplies their accessible
// names, role, tabindex, click handler, and Enter/Space activation handlers.
node.setAttribute("data-diagram-node", "")
const camera = createDiagramView(viewport, stage, {
  isExpanded: () => hostExpanded,
})
// After host-rendered content or expansion changes:
camera.refresh()
// On unmount, before removing the host DOM:
camera.destroy()
```

- Set `data-diagram-node` only on selectable SVG nodes that should also start
  touch pan/pinch in expanded mode. The attribute value is not significant.
  - A marked node can keep `role="button"` and `tabindex="0"`. A tap still
    activates it. A completed touch drag beyond 6 CSS pixels suppresses that
    gesture's click, including clicks retargeted by pointer capture.
  - Cancellation or lost pointer capture ends tracking. The next tap works.
    Keyboard, assistive-technology, and programmatic clicks with `detail: 0`
    remain available after a drag.
  - Native controls, links, labels, summaries, editable descendants, and nested
    unmarked `[tabindex]` controls keep their own gestures. Marking a native
    control does not opt it in. Unmarked controls keep their existing behavior.
  - The marker does not change mouse, pen, wheel, or keyboard control isolation.
- The host must set `transform-origin: 0 0` on the stage, clip the viewport, and
  manage touch CSS before gestures begin: `touch-action: pan-y` inline for page
  scrolling and `touch-action: none` only on the expanded two-dimensional camera.
  Inline touch does not move the camera, including touches starting on nodes.
- By default, the camera sets the inline viewport height. Set
  `manageInlineHeight: false` if the host styles that height itself. The camera
  leaves the inline height untouched, including when expanded, and fits to the
  measured space inside the viewport padding.
- Without a focus region, reset defaults to the readable camera. It measures
  SVG text and HTML span/paragraph labels inside `foreignObject`. Set
  `resetMode: "native"` to reset to a centered 100% instead; in native mode
  the zoom floor is the smaller of 25% and the fitted overview scale, including
  after a resize. Set `focusMaxScale` to cap automatic focus zoom (default 4).
  A focus region never zooms below the overview scale, and manual zoom still
  goes up to 400%.
- Hidden, detached, and zero-space viewports do not handle camera input.
  Neither does a stage hidden with `display: none`. Use
  `isInteractionEnabled: () => ready` if the host needs to suspend camera input
  while it renders or replaces content. Call `camera.refresh()` after a host
  state change to release active pointer capture and apply the current view
  when it becomes visible again. The Escape hook can still close fullscreen.
- The host retains activation, accessible names, keyboard handlers, and focus
  styles. The camera does not install node actions or change focusability.
- `destroy()` removes camera listeners and releases active pointer captures. The
  host must also remove its own node handlers and finalize its renderer.

## Trust and limits

This package is **not an untrusted HTML renderer**. Sanitize SVG before passing
`svg`. Keep resource policies, source limits, lazy rendering, renderer queues,
stale-result handling, and renderer finalization in the host. Source is text,
never HTML. The package loads no remote renderer, CDN, font, or resource.

SVG download uses the rendered markup directly. PNG separately serializes a
clone with natural dimensions and background; it does not alter the live SVG.
PNG limits are 8,192 pixels per dimension, 16 million pixels, and 16 MiB of
serialized SVG. Decode/encoding failures produce action feedback.

## Build and test

Run these commands from the repository root. Use Node.js 24.15 or later in the
24.x series, or Node.js 26 or later, with npm 11 or later.

```sh
npm ci
npx playwright install chromium
npm run ci
npm run test:browser
```

`npm run ci` lints, typechecks, builds, runs unit tests, and tests the npm tarball
in a temporary app. The tarball test checks the package contents, imports the core
without React or a DOM, typechecks consumer examples, builds a Vite app, and
exercises it in Chromium. It does not publish to npm. Run
`npm run test:package` to repeat the tarball test after `npm run build`.

Playwright tests use Wayland on WSL. The automated browser checks cover desktop
Chromium, not other browsers, physical touch devices, or screen readers.
Playwright output under `test-results/` is ignored by Git.

To build and pack without publishing, run `npm pack --pack-destination /tmp`.
To enable the Biome and zizmor Git hooks, install
[prek](https://prek.j178.dev/installation/) and run `prek install`.

## Project site

With dependencies installed, build and serve the static site at its GitHub Pages
path:

```sh
npm run build:site
npm exec -- vite preview site --base /diagram-viewer/ --host 127.0.0.1
```

Open `http://127.0.0.1:4173/diagram-viewer/`. `npm run test:browser` also checks
this build at the project path on desktop and narrow Chromium viewports.

To enable publishing, set **Settings → Pages → Build and deployment → Source**
to **GitHub Actions**. The [GitHub Pages workflow](.github/workflows/pages.yml)
publishes `site/dist/` after pushes to `main`, or when run manually from `main`.
It does not publish the npm package.

## Releases

Run `npm run changeset` and commit the resulting file with each releasable
change. Use `patch` for fixes, `minor` for features, and `major` for breaking
changes. Run `npm run changeset -- status` to inspect pending changesets.

The [release workflow](.github/workflows/release.yml) runs `npm ci` to install
Changesets and the build tools. When changesets reach `main`, it opens or updates
a pull request with the new version, changelog, and npm lockfile. Merging that
pull request publishes the new version to npm and creates a Git tag and a GitHub
release.

Before releasing from this repository, update the package's npm trusted publisher
to use `narumiruna/diagram-viewer` and the `release.yml` workflow. Configure the
repository's `PAT_TOKEN` secret for the workflow to create and update version
pull requests.
