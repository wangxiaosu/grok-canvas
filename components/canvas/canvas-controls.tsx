"use client";

import { ControlButton } from "@/components/ui/control-button";

import { useReactFlow, useStore } from "@xyflow/react";
import { Map as MapIcon, Maximize } from "lucide-react";

export function CanvasControls({
  minimapOpen,
  onToggleMinimap,
}: {
  minimapOpen: boolean;
  onToggleMinimap: () => void;
}) {
  const zoom = useStore((state) => state.transform[2]);
  const { zoomTo, fitView } = useReactFlow();

  return (
    <div className="ui-canvas-toolbar absolute bottom-3 left-3 z-20 flex items-center gap-1 rounded-full bg-popover px-2 py-1.5 text-popover-foreground shadow-xl ring-1 ring-foreground/10">
      <ControlButton
        className={`flex size-7 items-center justify-center rounded-full hover:bg-accent ${
          minimapOpen ? "bg-accent" : ""
        }`}
        aria-label={minimapOpen ? "隐藏小地图" : "显示小地图"}
        aria-pressed={minimapOpen}
        onClick={onToggleMinimap}
      >
        <MapIcon className="size-4" />
      </ControlButton>
      <ControlButton
        className="flex size-7 items-center justify-center rounded-full hover:bg-accent"
        aria-label="适应全部节点"
        onClick={() => void fitView()}
      >
        <Maximize className="size-4" />
      </ControlButton>
      <div className="flex items-center gap-1">
        <span className="w-8 text-right text-xs text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <input
          type="range"
          min={0.1}
          max={2}
          step={0.01}
          value={zoom}
          aria-label="缩放"
          className="h-1 w-16 cursor-pointer accent-foreground"
          onChange={(event) => void zoomTo(Number(event.target.value))}
        />
      </div>
    </div>
  );
}
