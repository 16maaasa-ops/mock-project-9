import { CustomerTable } from "@/components/admin/CustomerTable";
import { fetchCustomerList } from "@/lib/customers/read";

export default async function AdminCustomersPage() {
  const rows = await fetchCustomerList();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">顧客</h1>
        <p className="mt-1 text-sm text-brand-espresso-soft">
          メールアドレスは既定でマスク表示です。タップすると一時的に表示できます。
          LINEとの連携（Webhook・コード入力）はフェーズ3で実装するため、現在は全員「未連携」です。
        </p>
      </div>
      <CustomerTable rows={rows} />
    </div>
  );
}
