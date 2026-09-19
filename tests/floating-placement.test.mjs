import test from "node:test";
import assert from "node:assert/strict";
import { fitFloatingRect, placeNodePanel } from "../lib/floating-placement.ts";

test("right-bottom context menu remains inside the window", () => {
  assert.deepEqual(fitFloatingRect(1180, 790, 160, 180, 1200, 823), { left: 1028, top: 631 });
});
test("low nodes keep their panel below even beyond the screen edge", () => {
  const placed = placeNodePanel({ x: 614, bottom: 741, width: 49 }, 560);
  assert.deepEqual(placed, { left: 358.5, top: 753, width: 560 });
});
test("ordinary placement retains the original below-node relationship", () => {
  assert.deepEqual(placeNodePanel({ x: 500, bottom: 280, width: 80 }, 560), { left: 260, top: 292, width: 560 });
});
test("offscreen nodes retain relative panel position and full width", () => {
  assert.deepEqual(placeNodePanel({ x: -1000, bottom: -420, width: 80 }, 560), { left: -1240, top: -408, width: 560 });
});
