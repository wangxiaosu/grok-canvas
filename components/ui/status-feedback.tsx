import { Button } from "./button";

export function StatusFeedback({ message, retry, compact = false, tone = "muted", actionLabel }: {
  message: string;
  retry?: () => void;
  compact?: boolean;
  tone?: "muted" | "error";
  actionLabel?: string;
}) {
  const isError = tone === "error";
  return <div role={isError ? "alert" : "status"} className={`flex items-center justify-center gap-3 text-sm ${isError ? "text-destructive" : "text-muted-foreground"} ${compact ? "" : "flex-col p-4 text-center"}`}>
    <p>{message}</p>
    {retry && <Button type="button" size="sm" variant="outline" onClick={retry}>{actionLabel ?? "重试"}</Button>}
  </div>;
}
