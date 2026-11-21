---
"@narumitw/diagram-viewer": minor
---

Keep button tooltips readable on narrow screens and visible while the pointer is over them. Use `viewportLabelledBy` on `DiagramViewer` or `aria-labelledby` on `DiagramViewport` to name a viewport from an existing heading. Keyboard instructions are now announced separately from the viewport name. Restore focus to the fullscreen button even if the browser reports the exit before the button is enabled again.
