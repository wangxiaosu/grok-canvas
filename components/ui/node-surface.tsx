import type { CSSProperties, ReactNode } from "react";

/** Shared selection appearance; compensation keeps a 2px screen-space boundary. */
export function NodeSurface({ selected, zoom = 1, className = "", style, children }: {
  selected?: boolean;
  zoom?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return <div data-selected={!!selected}
    className={`ui-node-surface overflow-hidden rounded-xl bg-muted transition-shadow ${selected ? "ring-2 ring-primary" : ""} ${className}`}
    style={{ ...style, "--selection-width": `${2 / Math.max(0.1, zoom)}px` } as CSSProperties}>
    {children}
  </div>;
}
