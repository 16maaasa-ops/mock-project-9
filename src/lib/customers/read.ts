import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { Segment } from "@/lib/segment/types";

const PAGE_SIZE = 1000;

export type CustomerListRow = {
  customerId: string;
  email: string;
  lineUserId: string | null;
  segment: Segment | null;
  segmentOverride: Segment | null;
  syncStatus: string;
  unusedCode: { code: string; expiresAt: string } | null;
  orderCount: number;
  totalAmount: number;
  lastOrderDate: string | null;
};

/** 現在保存されている segment 列（手動判定前）を customer_id → segment で返す。 */
export async function fetchCustomerSegments(): Promise<
  Map<string, Segment | null>
> {
  const supabase = createServiceClient();
  const result = new Map<string, Segment | null>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("customers")
      .select("customer_id, segment")
      .order("customer_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data)
      result.set(row.customer_id, row.segment as Segment | null);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return result;
}

/**
 * 顧客一覧画面用に、顧客・注文の集計・未使用コードの有無をまとめて返す。
 * 件数は数十〜百件規模の模擬案件を前提に、アプリ側で集計する
 * （専用のSQLビューは導入せず、シンプルさを優先している）。
 */
export async function fetchCustomerList(): Promise<CustomerListRow[]> {
  const supabase = createServiceClient();

  const customers: {
    customer_id: string;
    email: string;
    line_user_id: string | null;
    segment: Segment | null;
    segment_override: Segment | null;
    sync_status: string;
  }[] = [];
  {
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("customers")
        .select(
          "customer_id, email, line_user_id, segment, segment_override, sync_status",
        )
        .order("customer_id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      customers.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  const orderAgg = new Map<
    string,
    { orderCount: number; totalAmount: number; lastOrderDate: string | null }
  >();
  {
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
        const agg = orderAgg.get(row.customer_id) ?? {
          orderCount: 0,
          totalAmount: 0,
          lastOrderDate: null as string | null,
        };
        agg.orderCount += 1;
        agg.totalAmount += Number(row.amount);
        if (!agg.lastOrderDate || row.order_date > agg.lastOrderDate) {
          agg.lastOrderDate = row.order_date;
        }
        orderAgg.set(row.customer_id, agg);
      }
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  const unusedCodeByCustomer = new Map<
    string,
    { code: string; expiresAt: string }
  >();
  {
    const { data, error } = await supabase
      .from("link_codes")
      .select("customer_id, code, expires_at")
      .is("used_at", null);
    if (error) throw error;
    for (const row of data ?? []) {
      unusedCodeByCustomer.set(row.customer_id, {
        code: row.code,
        expiresAt: row.expires_at,
      });
    }
  }

  return customers.map((c) => {
    const agg = orderAgg.get(c.customer_id);
    return {
      customerId: c.customer_id,
      email: c.email,
      lineUserId: c.line_user_id,
      segment: c.segment,
      segmentOverride: c.segment_override,
      syncStatus: c.sync_status,
      unusedCode: unusedCodeByCustomer.get(c.customer_id) ?? null,
      orderCount: agg?.orderCount ?? 0,
      totalAmount: agg?.totalAmount ?? 0,
      lastOrderDate: agg?.lastOrderDate ?? null,
    };
  });
}
