/** Cancel browser zoom defaults without stopping events handled by the canvas. */
export function installPageZoomGuard(target: EventTarget): () => void {
  const wheel = (event: Event) => {
    // Chromium/Firefox expose trackpad pinch as a Ctrl+wheel event.
    // Physical Ctrl+wheel is indistinguishable and is also prevented here.
    if ((event as WheelEvent).ctrlKey && event.cancelable) event.preventDefault();
  };
  const gesture = (event: Event) => {
    // WebKit's native pinch events use a separate event family.
    if (event.cancelable) event.preventDefault();
  };
  const options = { passive: false };
  target.addEventListener("wheel", wheel, options);
  target.addEventListener("gesturestart", gesture, options);
  target.addEventListener("gesturechange", gesture, options);
  return () => {
    target.removeEventListener("wheel", wheel);
    target.removeEventListener("gesturestart", gesture);
    target.removeEventListener("gesturechange", gesture);
  };
}
