import Link from "next/link";
import { verifySession } from "@/lib/auth/dal";
import { getSegmentSettings } from "@/lib/settings/read";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { ReferenceDateBanner } from "@/components/admin/ReferenceDateBanner";

const NAV_ITEMS = [
  { href: "/admin", label: "ダッシュボード" },
  { href: "/admin/settings", label: "LINE接続・設定" },
  { href: "/admin/richmenus", label: "メニュー" },
  { href: "/admin/import", label: "CSV取り込み" },
  { href: "/admin/customers", label: "顧客" },
] as const;

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await verifySession();
  const settings = await getSegmentSettings();

  return (
    <div className="flex min-h-dvh flex-col">
      <ReferenceDateBanner referenceDate={settings.referenceDate} />

      <header className="flex items-center justify-between border-b border-brand-border bg-white px-4 py-3 sm:px-6">
        <p className="font-bold">リッチメニュー自動切替 管理画面</p>
        <LogoutButton />
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-brand-border bg-white px-2 py-1 sm:px-4">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-brand-espresso-soft hover:bg-brand-cream hover:text-brand-espresso"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
