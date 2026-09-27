import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { ExistingOrder } from "./preview";

const PAGE_SIZE = 1000;

/** 既存の注文を order_id をキーにしたMapで返す（取り込み前の確認・内容相違の検出に使う）。 */
export async function fetchExistingOrdersById(): Promise<
  Map<string, ExistingOrder>
> {
  const supabase = createServiceClient();
  const result = new Map<string, ExistingOrder>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "order_id, customer_id, order_date, product_name, quantity, amount",
      )
      .order("order_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      result.set(row.order_id, {
        customerId: row.customer_id,
        orderDate: row.order_date,
        productName: row.product_name,
        quantity: row.quantity,
        amount: Number(row.amount),
      });
    }
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return result;
}

/** 既存の顧客のメールアドレスを customer_id をキーにしたMapで返す。 */
export async function fetchExistingCustomerEmails(): Promise<
  Map<string, string>
> {
  const supabase = createServiceClient();
  const result = new Map<string, string>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("customers")
      .select("customer_id, email")
      .order("customer_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) result.set(row.customer_id, row.email);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return result;
}
