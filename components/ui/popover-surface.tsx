"use client";

import { Popover } from "@base-ui/react/popover";
import { cn } from "cn";

/** Shared floating surface; width and inner density remain specific to each tool. */
export function PopoverSurface({ className, ...props }: Popover.Popup.Props) {
  return <Popover.Popup {...props} className={cn("origin-(--transform-origin) rounded-xl bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className)} />;
}
