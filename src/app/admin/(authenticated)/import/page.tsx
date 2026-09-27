import { CsvImportForm } from "@/components/admin/CsvImportForm";
import { fetchRecentImportJobs } from "@/lib/import/actions";

const STATUS_LABELS: Record<string, string> = {
  running: "処理中",
  success: "完了",
  failed: "失敗",
};

export default async function AdminImportPage() {
  const jobs = await fetchRecentImportJobs();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-bold">CSV取り込み</h1>
        <p className="mt-1 text-sm text-brand-espresso-soft">
          列: order_id, order_date, customer_id, customer_email, product_name,
          quantity, amount
        </p>
      </div>

      <CsvImportForm />

      <section>
        <h2 className="font-semibold">取り込み履歴</h2>
        {jobs.length === 0 ? (
          <p className="mt-2 text-sm text-brand-espresso-soft">
            まだ取り込みはありません。
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-brand-border bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-brand-border text-brand-espresso-soft">
                <tr>
                  <th className="px-3 py-2">日時</th>
                  <th className="px-3 py-2">ファイル</th>
                  <th className="px-3 py-2">状態</th>
                  <th className="px-3 py-2">新規</th>
                  <th className="px-3 py-2">重複</th>
                  <th className="px-3 py-2">セグメント変化</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b border-brand-border last:border-0"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(job.createdAt).toLocaleString("ja-JP")}
                    </td>
                    <td className="px-3 py-2">{job.filename}</td>
                    <td className="px-3 py-2">
                      {job.status === "failed" ? (
                        <span className="text-red-700">
                          {STATUS_LABELS[job.status] ?? job.status}
                          {job.errorMessage ? `（${job.errorMessage}）` : ""}
                        </span>
                      ) : (
                        (STATUS_LABELS[job.status] ?? job.status)
                      )}
                    </td>
                    <td className="px-3 py-2">{job.newOrderCount ?? "-"}</td>
                    <td className="px-3 py-2">{job.duplicateCount ?? "-"}</td>
                    <td className="px-3 py-2">
                      {job.changedCustomerCount ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
