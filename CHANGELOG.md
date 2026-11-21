# @narumitw/diagram-viewer

## 0.5.0

### Minor Changes

- cb071bd: Keep button tooltips readable on narrow screens and visible while the pointer is over them. Use `viewportLabelledBy` on `DiagramViewer` or `aria-labelledby` on `DiagramViewport` to name a viewport from an existing heading. Keyboard instructions are now announced separately from the viewport name. Restore focus to the fullscreen button even if the browser reports the exit before the button is enabled again.
- f328d29: Make the canvas layout the default, with floating controls that dock on narrow viewers and an initially closed Overview for eligible SVGs. When upgrading, set `toolbar="classic"` to restore the previous interface. The grouped toolbar, docked controls, and icon-and-text labels are also available. Buttons are icon-only by default.

## 0.4.0

### Minor Changes

- 9a77a76: Let hosts keep their own diagram height, reset to a centered native scale, and cap automatic focus zoom. Hidden or suspended cameras end active gestures and ignore zoom and pan input without losing their view.

### Patch Changes

- e9d26bf: Stop active drags when opening source view. Ignore camera input when CSS hides the diagram stage, even if the viewport remains visible.

## 0.3.0

### Minor Changes

- b944d76: Add optional slide focus rectangles. Fit keeps the focus frame in the
  overview, and Reset returns to the slide's detail view. Viewers embedded in
  slide decks can use Shift + arrow keys for panning so plain arrows remain
  available for slide navigation.

## 0.2.0

### Minor Changes

- 4d0e41f: Add an explicit selectable SVG node touch affordance; preserve taps and control isolation while suppressing post-drag activation and releasing gesture listeners and captures. Measure HTML-only SVG labels when selecting readable scaling.

## 0.1.1

### Patch Changes

- 527628e: Track diagram-viewer versions and changelogs with Changesets. Add a dedicated
  public npm release workflow with provenance and exact-version retry checks.
