"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await fetch("/api/admin/logout", { method: "POST" });
          router.replace("/admin/login");
          router.refresh();
        });
      }}
      className="rounded-md border border-brand-border px-3 py-1.5 text-sm text-brand-espresso-soft hover:bg-brand-cream disabled:opacity-60"
    >
      {pending ? "ログアウト中…" : "ログアウト"}
    </button>
  );
}
