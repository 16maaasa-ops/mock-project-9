"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "ログインできませんでした。");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("通信に失敗しました。ネットワーク状態を確認してください。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6">
      <h1 className="text-xl font-bold">管理画面ログイン</h1>
      <p className="mt-1 text-sm text-brand-espresso-soft">
        購買連動リッチメニュー自動切替システム
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          ID
          <input
            type="text"
            autoComplete="username"
            value={id}
            onChange={(e) => setId(e.target.value)}
            className="rounded-lg border border-brand-border bg-white px-3 py-2 text-base outline-none focus:border-brand-caramel"
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          パスワード
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-brand-border bg-white px-3 py-2 text-base outline-none focus:border-brand-caramel"
            required
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-lg bg-brand-espresso px-4 py-3 text-base font-medium text-brand-cream disabled:opacity-60"
        >
          {submitting ? "確認しています…" : "ログイン"}
        </button>
      </form>
    </main>
  );
}
