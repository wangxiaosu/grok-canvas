"use client";

import { useState, type SyntheticEvent } from "react";
import { StatusFeedback } from "./status-feedback";

/** Key by src to clear failure and retry state when the asset changes. */
export function AssetImage(props: { src: string; alt: string; className?: string; onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void }) {
  return <AssetImageState key={props.src} {...props} />;
}
function AssetImageState({ src, alt, className, onLoad }: { src: string; alt: string; className?: string; onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (failed) return <StatusFeedback tone="error" message="图片加载失败" retry={() => { setFailed(false); setAttempt(value => value + 1); }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={attempt ? `${src}${src.includes("?") ? "&" : "?"}retry=${attempt}` : src} alt={alt} className={className} draggable={false} onLoad={onLoad} onError={() => setFailed(true)} />;
}
