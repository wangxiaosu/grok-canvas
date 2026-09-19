import os from "node:os";
import path from "node:path";

/** Runtime data (assets, canvases, generation records) lives outside the repository. */
export function dataDir(): string {
  return process.env.GROK_CANVAS_DATA_DIR ?? path.join(os.homedir(), ".grok-canvas", "data");
}
