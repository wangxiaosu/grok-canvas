"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { PopoverSurface } from "@/components/ui/popover-surface";
import { AssetImage } from "@/components/ui/asset-image";
import { useDesktopAvailable } from "@/components/desktop-workspace";
import { referencePattern } from "@/lib/prompt-references";
import { displayGenerationPrompt, generationRows, type GenerationDetails } from "@/lib/generation-details";

function ReferenceThumbnail({ asset, index }: { asset: string; index: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="text-xs text-muted-foreground">点击重试</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/assets/${encodeURIComponent(asset)}`} alt={`参考图 ${index + 1}`} draggable={false} className="h-full w-full object-cover" onError={() => setFailed(true)} />;
}

function ReferencePreview({ asset, index, inline = false }: { asset: string; index: number; inline?: boolean }) {
  const desktop = useDesktopAvailable();
  return <Popover.Root>
    <Popover.Trigger data-ui-control="true" className={inline
      ? "mx-0.5 inline-flex h-6 max-w-full items-center gap-1.5 rounded bg-accent px-1.5 align-middle text-sm leading-none focus-visible:outline-2 focus-visible:outline-primary"
      : "h-14 w-14 overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-primary"}
      aria-label={`预览参考图 ${index + 1}`}>
      {inline ? <><span className="h-4 w-4 shrink-0 overflow-hidden rounded"><ReferenceThumbnail asset={asset} index={index} /></span><span>图片</span></> : <ReferenceThumbnail asset={asset} index={index} />}
    </Popover.Trigger>
    {desktop && <Popover.Portal><Popover.Positioner side="left" sideOffset={10} className="z-[100]" collisionPadding={12}>
      <PopoverSurface className="max-w-[calc(100vw-24px)] p-2">
        <AssetImage src={`/api/assets/${encodeURIComponent(asset)}`} alt={`参考图 ${index + 1}`} className="max-h-60 max-w-60 rounded-md object-contain" />
      </PopoverSurface>
    </Popover.Positioner></Popover.Portal>}
  </Popover.Root>;
}

function PromptReferences({ info }: { info: GenerationDetails }) {  const prompt = info.originalPrompt ?? "";
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of prompt.matchAll(referencePattern())) {
    parts.push(prompt.slice(cursor, match.index));
    const asset = match[1]!;
    const index = info.referenceAssets.indexOf(asset);
    parts.push(index < 0 ? <span key={match.index} className="text-muted-foreground">图片引用不可用</span>
      : <ReferencePreview key={match.index} asset={asset} index={index} inline />);
    cursor = match.index + match[0].length;
  }
  parts.push(prompt.slice(cursor));
  return <p className="whitespace-pre-wrap break-words leading-7">{parts}</p>;
}

function FramePreview({ asset, label }: { asset: string; label: string }) {
  return <span className="flex w-14 flex-col items-center gap-1">
    <ReferencePreview asset={asset} index={0} />
    <span className="text-[10px] leading-none text-muted-foreground">{label}</span>
  </span>;
}

export function GenerationInformation({ assetName }: { assetName: string }) {
  const [info, setInfo] = useState<GenerationDetails | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/assets/${encodeURIComponent(assetName)}/generation`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("unavailable");
        const data = await response.json();
        if (!controller.signal.aborted) { setInfo(data); setStatus("ready"); }
      }).catch(() => { if (!controller.signal.aborted) setStatus("error"); });
    return () => controller.abort();
  }, [assetName, attempt]);
  if (status === "ready" && !info) return null;
  const rows = info ? generationRows(info) : [];
  const prompt = info ? displayGenerationPrompt(info) : "";
  if (status === "ready" && !prompt.trim() && !info?.referenceAssets.length && !rows.length) return null;
  return <section className="mb-6" aria-label="生成信息">
    <h3 className="mb-3 text-sm font-medium">生成信息</h3>
    {status === "loading" && <p className="text-sm text-muted-foreground" role="status">读取中…</p>}
    {status === "error" && <p className="text-sm text-muted-foreground">生成信息读取失败 <button type="button" className="underline" onClick={() => { setStatus("loading"); setAttempt(n => n + 1); }}>重试</button></p>}
    {status === "ready" && info && <div className="space-y-4 rounded-xl bg-muted p-4 text-sm">
      {prompt.trim() && <div><h4 className="mb-2 text-muted-foreground">提示词</h4><PromptReferences info={info} /></div>}
      {!!(info.frames?.first || info.frames?.last) && <div><h4 className="mb-2 text-muted-foreground">首尾帧</h4><div className="flex flex-wrap gap-2">
        {info.frames?.first && <FramePreview asset={info.frames.first} label="首帧" />}
        {info.frames?.last && <FramePreview asset={info.frames.last} label="尾帧" />}
      </div></div>}
      {!!info.referenceAssets.length && <div><h4 className="mb-2 text-muted-foreground">参考图</h4><div className="flex flex-wrap gap-2">
        {info.referenceAssets.map((asset, index) => <ReferencePreview key={`${asset}-${index}`} asset={asset} index={index} />)}
      </div></div>}
      {!!rows.length && <dl className="space-y-3">{rows.map(([label, value]) => <div key={label} className="flex justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd>{value}</dd></div>)}</dl>}
    </div>}
  </section>;
}
