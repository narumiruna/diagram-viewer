# Default to the canvas layout and retain classic controls

Accepted: 2026-11-21.

## Context and Problem Statement

[`DiagramViewer`](../../src/index.tsx) previously offered only a single top toolbar as a preset with icon-only buttons. Developers can [compose their own controls](../../README.md#compose-controls), but must assemble the toolbar themselves. We want ready-to-use layouts for different viewing contexts without making developers assemble them. Large diagrams also need a way to show which part of the whole diagram is visible.

## Decision Drivers

- Make the canvas layout the default and keep the original interface available explicitly.
- Keep the canvas clear by default, while letting developers show button text where it helps.
- Reuse the existing actions, keyboard behavior, and viewport. Rendering and SVG sanitization stay with the host.

## Considered Options

1. **Keep the classic toolbar as the default.** Existing integrations would not change, but developers would need to opt in to the canvas layout.
2. **Make the canvas layout the default and keep a classic preset.** New and existing viewers without layout options get the canvas interface. Developers can select the old layout when they rely on its control placement.
3. **Require custom composition.** Developers would have full control but would need to rebuild common layouts and wire the Overview themselves.

## Decision Outcome

Choose the canvas layout by default, with explicit presets and overrides on the React `DiagramViewer`:

| Prop | Values | Default | Effect |
| --- | --- | --- | --- |
| `toolbar` | `"classic"`, `"grouped"`, `"canvas"` | `"canvas"` | Restore the original toolbar, group viewing and file controls at the top, or place viewing controls at the bottom with file controls at the top. |
| `canvasControls` | `"docked"`, `"floating"` | `"floating"` | In the canvas preset only, place the pan hint and viewing controls in a full-width bottom bar or float them separately at the bottom of the canvas. Fall back to the bottom bar when the viewer is too narrow. |
| `overview` | `false`, `true` | `true` for `"canvas"`; `false` otherwise | Offer a small map with a frame that marks the visible part of the diagram. This works with any toolbar preset. |
| `buttonDisplay` | `"icon"`, `"icon-and-text"` | `"icon"` | Set the display of all built-in Viewer action buttons, including Overview, in every preset. Does not change custom controls or non-button text such as the zoom percentage and pan hint. |

The floating controls must not cover diagram content or the Overview card. Both positions use the same controls and keyboard order. Keep the existing composition API for applications that need a custom layout.

When enabled and a thumbnail is available, Overview starts closed. The same button opens and closes it; closing gives the space back to the diagram without resetting user-controlled zoom. The map is read-only. It sits beside the canvas when there is room and below it on narrower viewers. It uses an isolated image of the host-supplied SVG. When no usable thumbnail is available, including for host-managed stages, omit the Overview button and card.

Icon-only buttons still have accessible names and show their labels on hover or keyboard focus. The new presets distinguish Fit and Fullscreen by their icons, not just by their labels. In icon-and-text mode, visible labels match accessible names. The Overview button reports whether the card is expanded in either mode.

```tsx
// Default: canvas with floating icon-only controls and an Overview button.
<DiagramViewer source={source} svg={svg} />

// Original interface, without the Overview button.
<DiagramViewer source={source} svg={svg} toolbar="classic" />

// Grouped toolbar with both icons and text.
<DiagramViewer
  source={source}
  svg={svg}
  toolbar="grouped"
  buttonDisplay="icon-and-text"
/>
```

### Consequences

Existing `DiagramViewer` calls with no toolbar option get the canvas layout on upgrade. Consumers who rely on the old toolbar placement or tab order can set `toolbar="classic"`. The layouts stay compact by default, but users unfamiliar with the icons may need the labels. Hosts can show text at the cost of more space. The library must keep wrappers, tooltips, and Overview usable as controls wrap in narrow containers.

### Confirmation

Verify that a Viewer without layout options starts in the canvas layout with floating controls and a closed Overview, and that `toolbar="classic"` restores the original control layout. Check every preset in both button displays, including accessible names and Overview keyboard toggling. Check that the floating layout falls back to the bottom bar in a narrow container and that the map tracks pan and zoom without covering the diagram.
