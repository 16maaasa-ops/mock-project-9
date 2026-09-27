import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { classifyAll, effectiveSegment } from "./classify";
import type { OrderLite, Segment, SegmentSettings } from "./types";

const PAGE_SIZE = 1000;

/**
 * 顧客数・注文数が Supabase の1回あたり取得件数の上限（既定1000件）を
 * 超えても黙って切り捨てられないよう、ページ分割してすべて読み込む。
 */
export async function fetchAllOrders(): Promise<OrderLite[]> {
  const supabase = createServiceClient();
  const rows: OrderLite[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("orders")
      .select("customer_id, order_date, amount")
      .order("order_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      rows.push({
        customerId: row.customer_id,
        orderDate: row.order_date,
        amount: Number(row.amount),
      });
    }
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

export async function fetchSegmentOverrides(): Promise<
  Map<string, Segment | null>
> {
  const supabase = createServiceClient();
  const overrides = new Map<string, Segment | null>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("customers")
      .select("customer_id, segment_override")
      .order("customer_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      overrides.set(row.customer_id, row.segment_override as Segment | null);
    }
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return overrides;
}

/**
 * 全顧客の「実際に適用すべきセグメント」を計算する（手動指定があればそちらを優先）。
 * CSV取り込み後の再計算と、設定変更の影響プレビューの両方から使う共通処理。
 */
export async function computeEffectiveSegments(
  settings: SegmentSettings,
  referenceDate: string,
): Promise<Map<string, Segment>> {
  const [orders, overrides] = await Promise.all([
    fetchAllOrders(),
    fetchSegmentOverrides(),
  ]);
  const classified = classifyAll(orders, settings, referenceDate);

  const result = new Map<string, Segment>();
  for (const [customerId, classification] of classified) {
    result.set(customerId, classification.segment);
  }
  // 注文が1件も無い顧客（override はあるが classifyAll には出てこない）も含める
  for (const [customerId] of overrides) {
    if (!result.has(customerId)) result.set(customerId, "new");
  }
  for (const [customerId, override] of overrides) {
    result.set(customerId, effectiveSegment(result.get(customerId)!, override));
  }
  return result;
}
