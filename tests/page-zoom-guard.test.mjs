import test from "node:test";
import assert from "node:assert/strict";
import { installPageZoomGuard } from "../lib/page-zoom-guard.ts";

function wheel(ctrlKey) {
  const event = new Event("wheel", { cancelable: true });
  Object.defineProperty(event, "ctrlKey", { value: ctrlKey });
  return event;
}

test("pinch default is canceled, but ordinary scrolling and keyboard remain available", () => {
  const target = new EventTarget();
  const cleanup = installPageZoomGuard(target);
  const pinch = wheel(true);
  const scroll = wheel(false);
  const keyboard = new Event("keydown", { cancelable: true });
  target.dispatchEvent(pinch); target.dispatchEvent(scroll); target.dispatchEvent(keyboard);
  assert.equal(pinch.defaultPrevented, true);
  assert.equal(scroll.defaultPrevented, false);
  assert.equal(keyboard.defaultPrevented, false);
  cleanup();
});

test("gesture handling does not suppress other handlers and is removed on cleanup", () => {
  const target = new EventTarget();
  const cleanup = installPageZoomGuard(target);
  let received = 0;
  target.addEventListener("wheel", () => received++);
  target.dispatchEvent(wheel(true));
  assert.equal(received, 1);
  for (const type of ["gesturestart", "gesturechange"]) {
    const event = new Event(type, { cancelable: true });
    target.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  }
  cleanup();
  for (const event of [wheel(true), new Event("gesturestart", { cancelable: true }), new Event("gesturechange", { cancelable: true })]) {
    target.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
  }
});
