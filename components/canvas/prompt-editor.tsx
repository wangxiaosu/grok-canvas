"use client";

import { useEffect, useRef, useState } from "react";
import { referencePattern, referenceToken, type PromptReference } from "@/lib/prompt-references";

function serialize(root: Node): string {
  if (root instanceof HTMLElement && root.dataset.asset) return referenceToken(root.dataset.asset);
  if (root.nodeType === Node.TEXT_NODE) return root.textContent ?? "";
  if (root.nodeName === "BR") return "\n";
  // Browsers leave a lone <br> in an emptied contenteditable to host the caret.
  // Actual spaces/newlines are text nodes (including our Enter/paste handlers).
  const children = Array.from(root.childNodes);
  if (children.filter((child) => child.nodeType !== Node.TEXT_NODE || child.textContent !== "").length === 1
    && children.some((child) => child.nodeName === "BR")
    && !root.textContent) return "";
  return children.map((child, index) => {
    const text = serialize(child);
    return index > 0 && (child.nodeName === "DIV" || child.nodeName === "P") ? `\n${text}` : text;
  }).join("");
}

export function PromptEditor({ nodeId, value, references, readOnly = false, placeholder, badge, onCommit, onSubmit }: {
  nodeId: string; value: string; references: PromptReference[]; readOnly?: boolean; placeholder?: string;
  /** @ 下拉项末尾的徽标（如视频参考图的接口编号 #1）；不传则不显示。 */
  badge?: (item: PromptReference, index: number) => string | null;
  onCommit: (value: string) => void; onSubmit: () => void;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const receivedValue = useRef<string | null>(null);
  const trigger = useRef<Range | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [empty, setEmpty] = useState(value.length === 0);
  const options = references.filter((item) => item.name.toLowerCase().includes((query ?? "").toLowerCase()));

  function chip(assetName: string) {
    const reference = references.find((item) => item.assetName === assetName);
    const span = document.createElement("span");
    span.contentEditable = "false";
    span.dataset.asset = assetName;
    span.className = `mx-0.5 inline-flex h-6 max-w-full items-center gap-1.5 rounded px-1.5 align-middle text-sm leading-none ${reference ? "bg-muted" : "bg-destructive/15 text-destructive"}`;
    span.title = reference?.name ?? "引用需更新：图片已移除或已改作其他角色，请修改后再生成";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.removeReference = "true";
    remove.contentEditable = "false";
    remove.setAttribute("aria-label", `删除引用：${reference?.name ?? "失效图片"}`);
    remove.title = "删除引用";
    remove.className = "ui-control inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-foreground/10 hover:text-foreground";
    remove.textContent = "×";
    if (reference) {
      const img = document.createElement("img");
      img.src = `/api/assets/${assetName}`;
      img.alt = "";
      img.className = "h-4 w-4 shrink-0 rounded object-cover";
      img.draggable = false;
      span.append(img);
    }
    const label = document.createElement("span");
    label.className = "truncate";
    label.textContent = reference?.name ?? "引用需更新";
    span.append(label, remove);
    return span;
  }

  useEffect(() => {
    const root = editor.current;
    if (!root || composing.current) return;
    const firstRender = receivedValue.current === null;
    const valueChanged = receivedValue.current !== value;
    receivedValue.current = value;
    // Reference-list/local-state renders can still carry the previous store value.
    // Only a new incoming value may hydrate the DOM; an echo of our own input
    // already matches the DOM and must preserve the browser's selection.
    if (valueChanged && serialize(root) !== value) {
      root.replaceChildren();
      let offset = 0;
      for (const match of value.matchAll(referencePattern())) {
        root.append(document.createTextNode(value.slice(offset, match.index)), chip(match[1]!));
        offset = match.index! + match[0].length;
      }
      root.append(document.createTextNode(value.slice(offset)));
    } else {
      root.querySelectorAll<HTMLElement>("[data-asset]").forEach((item) => {
        const next = chip(item.dataset.asset!);
        if (item.title !== next.title || item.className !== next.className) item.replaceWith(next);
      });
    }
    setEmpty(serialize(root).length === 0);
    if (firstRender && !readOnly) {
      root.focus();
      const range = document.createRange();
      range.selectNodeContents(root);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [value, references, readOnly]); // Keep ordinary typing outside React's DOM reconciliation.

  function commit() {
    if (!editor.current) return;
    const next = serialize(editor.current);
    setEmpty(next.length === 0);
    onCommit(next);
  }

  function removeChip(tag: HTMLElement) {
    const range = document.createRange();
    range.setStartBefore(tag);
    range.collapse(true);
    tag.remove();
    editor.current?.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    setQuery(null);
    commit();
  }

  function detect() {
    const selection = window.getSelection();
    if (!selection?.isCollapsed || !selection.rangeCount || !references.length) { setQuery(null); return; }
    const range = selection.getRangeAt(0);
    if (range.startContainer.nodeType !== Node.TEXT_NODE || !editor.current?.contains(range.startContainer)) { setQuery(null); return; }
    const before = range.startContainer.textContent?.slice(0, range.startOffset) ?? "";
    const match = before.match(/@([^@\s]*)$/);
    if (!match) { setQuery(null); return; }
    const replacement = range.cloneRange();
    replacement.setStart(range.startContainer, range.startOffset - match[0].length);
    trigger.current = replacement;
    setQuery(match[1]!);
    setActive(0);
  }

  function choose(item: PromptReference) {
    const range = trigger.current;
    if (!range || !editor.current?.contains(range.startContainer)) return;
    range.deleteContents();
    const tag = chip(item.assetName);
    range.insertNode(tag);
    const space = document.createTextNode(" ");
    tag.after(space);
    range.setStart(space, 1);
    range.collapse(true);
    editor.current.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    setQuery(null);
    commit();
  }

  return <div className="relative">
    {empty && <div className="pointer-events-none absolute left-1 top-2 text-base text-muted-foreground">
      {placeholder ?? (references.length ? "描述你想生成的画面，输入 @ 引用附件，例如：参考 @图片 的服装" : "描述你想生成的画面")}
    </div>}
    <div ref={editor} contentEditable={!readOnly} aria-readonly={readOnly || undefined} suppressContentEditableWarning role="textbox" aria-label="生成描述" aria-multiline="true"
      aria-expanded={query !== null} aria-controls={query !== null ? `references-${nodeId}` : undefined}
      aria-activedescendant={query !== null && options[active] ? `reference-${nodeId}-${active}` : undefined}
      className="ui-prompt-editor max-h-60 min-h-24 overflow-y-auto whitespace-pre-wrap break-words px-1 py-2 text-base outline-none"
      onCompositionStart={() => { composing.current = true; setQuery(null); }}
      onCompositionEnd={() => { composing.current = false; commit(); detect(); }}
      onInput={() => {
        if (readOnly) return;
        if (editor.current) setEmpty(serialize(editor.current).length === 0);
        if (!composing.current) { commit(); detect(); }
      }}
      onMouseDown={(event) => {
        if ((event.target as HTMLElement).closest("[data-remove-reference]")) event.preventDefault();
      }}
      onClick={(event) => {
        if (readOnly) return;
        const button = (event.target as HTMLElement).closest("[data-remove-reference]");
        const tag = button?.closest<HTMLElement>("[data-asset]");
        if (tag) { event.preventDefault(); event.stopPropagation(); removeChip(tag); }
        else detect();
      }}
      onKeyUp={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) && !composing.current) detect(); }}
      onBlur={() => setQuery(null)}
      onPaste={(event) => {
        event.preventDefault();
        if (readOnly) return;
        const selection = window.getSelection();
        if (!selection?.rangeCount) return;
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const text = document.createTextNode(event.clipboardData.getData("text/plain"));
        range.insertNode(text); range.setStartAfter(text); range.collapse(true);
        selection.removeAllRanges(); selection.addRange(range); commit(); detect();
      }}
      onKeyDown={(event) => {
        if (readOnly || event.nativeEvent.isComposing || composing.current) return;
        if ((event.key === "Backspace" || event.key === "Delete") && !event.metaKey && !event.ctrlKey && !event.altKey) {
          const selection = window.getSelection();
          if (selection?.isCollapsed && selection.rangeCount) {
            const range = selection.getRangeAt(0);
            const container = range.startContainer;
            const backwards = event.key === "Backspace";
            let adjacent: Node | null = null;
            if (container.nodeType === Node.TEXT_NODE) {
              if (backwards && range.startOffset === 0) adjacent = container.previousSibling;
              if (!backwards && range.startOffset === (container.textContent?.length ?? 0)) adjacent = container.nextSibling;
            } else {
              adjacent = container.childNodes[range.startOffset - (backwards ? 1 : 0)] ?? null;
            }
            while (adjacent?.nodeType === Node.TEXT_NODE && !adjacent.textContent) {
              adjacent = backwards ? adjacent.previousSibling : adjacent.nextSibling;
            }
            if (adjacent instanceof HTMLElement && adjacent.dataset.asset) {
              event.preventDefault(); removeChip(adjacent); return;
            }
          }
        }
        if (query !== null) {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setQuery(null); return; }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setActive((index) => options.length ? (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length : 0); return;
          }
          if ((event.key === "Enter" || event.key === "Tab") && options[active]) { event.preventDefault(); choose(options[active]!); return; }
        }
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); commit(); onSubmit(); return; }
        if (event.key === "Enter") {
          event.preventDefault();
          const selection = window.getSelection();
          if (!selection?.rangeCount) return;
          const range = selection.getRangeAt(0); range.deleteContents();
          const text = document.createTextNode("\n"); range.insertNode(text); range.setStartAfter(text); range.collapse(true);
          selection.removeAllRanges(); selection.addRange(range); commit();
        }
      }} />
    {query !== null && <div id={`references-${nodeId}`} role="listbox" aria-label="选择参考附件" className="absolute left-0 top-full z-50 max-h-60 w-72 overflow-y-auto rounded-xl border bg-popover p-1 shadow-xl">
      {options.length ? options.map((item, index) => <button key={item.assetName} id={`reference-${nodeId}-${index}`} type="button" role="option" aria-selected={index === active}
        className={`ui-control flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm ${index === active ? "bg-accent" : "hover:bg-accent"}`}
        onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/assets/${item.assetName}`} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
        <span className="truncate">{item.name}</span>
        {badge?.(item, index) ? <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{badge(item, index)}</span> : null}
      </button>) : <p className="p-3 text-sm text-muted-foreground">没有匹配的附件</p>}
    </div>}
  </div>;
}
