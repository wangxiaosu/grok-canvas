import { Button } from "@/components/ui/button";
import { StatusFeedback } from "@/components/ui/status-feedback";

export const dynamic = "force-dynamic";

export default async function AuthResult({ searchParams }: {
  searchParams: Promise<{ auth?: string }>;
}) {
  const { auth } = await searchParams;
  // Success is verified server-side; a URL parameter alone is not proof of login.
  const { loadAuth, isLoggedIn } = await import("@/lib/xai/store");
  const ok = auth === "ok" && isLoggedIn(await loadAuth());
  return <main className="flex min-h-screen items-center justify-center bg-background p-8 text-foreground">
    <section className="flex max-w-md flex-col items-center gap-6 text-center">
      <h1 className="text-xl font-semibold">{ok ? "登录成功" : "登录未完成"}</h1>
      <StatusFeedback tone={ok ? "muted" : "error"} message={ok ? "可以关闭此页，原画布会自动更新登录状态。" : "授权被取消、已过期或未能完成。请返回画布重新登录。"} />
      <Button render={<a href="/" />}>返回画布</Button>
    </section>
  </main>;
}
