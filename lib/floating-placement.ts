/** Coordinates relative to the containing viewport, in CSS pixels. */
export function fitFloatingRect(x: number, y: number, width: number, height: number, viewportWidth: number, viewportHeight: number, margin = 12) {
  return {
    left: Math.max(margin, Math.min(x, viewportWidth - width - margin)),
    top: Math.max(margin, Math.min(y, viewportHeight - height - margin)),
  };
}

/** Always follow the node below it; users pan the canvas when clipped. */
export function placeNodePanel(node: { x: number; bottom: number; width: number }, panelWidth: number) {
  return { left: node.x + (node.width - panelWidth) / 2, top: node.bottom + 12, width: panelWidth };
}
