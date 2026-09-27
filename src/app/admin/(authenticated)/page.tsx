import { buildInitialChecklist } from "@/lib/dashboard/checklist";
import { createServiceClient } from "@/lib/supabase/service";

export default async function AdminDashboardPage() {
  const supabase = createServiceClient();

  const [richMenuResult, orderResult, codeResult] = await Promise.all([
    supabase
      .from("richmenus")
      .select("slot", { count: "exact", head: true })
      .not("line_richmenu_id", "is", null),
    supabase.from("orders").select("order_id", { count: "exact", head: true }),
    supabase.from("link_codes").select("code", { count: "exact", head: true }),
  ]);

  const lineConnected = Boolean(
    process.env.LINE_CHANNEL_SECRET && process.env.LINE_CHANNEL_ACCESS_TOKEN,
  );

  const checklist = buildInitialChecklist({
    lineConnected,
    richMenuSlotsRegistered: richMenuResult.count ?? 0,
    ordersImported: (orderResult.count ?? 0) > 0,
    codesIssued: (codeResult.count ?? 0) > 0,
  });
  const allDone = checklist.every((item) => item.done);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">ダッシュボード</h1>

      {!allDone && (
        <section className="rounded-xl border border-brand-border bg-white p-4">
          <h2 className="font-semibold">
            はじめに（この順番で進めてください）
          </h2>
          <ol className="mt-3 flex flex-col gap-2">
            {checklist.map((item) => (
              <li key={item.key} className="flex items-center gap-2 text-sm">
                <span aria-hidden>{item.done ? "✅" : "⬜"}</span>
                {item.done ? (
                  <span className="text-brand-espresso-soft line-through">
                    {item.label}
                  </span>
                ) : (
                  <a
                    href={item.href}
                    className="font-medium text-brand-caramel underline underline-offset-2"
                  >
                    {item.label}
                  </a>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="text-sm text-brand-espresso-soft">
        セグメント別の人数・反映状況・AIによる要約の表示は、フェーズ4で実装します。
      </p>
    </div>
  );
}
