"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/auth/dal";
import { generateLinkCode } from "@/lib/link/code";
import { todayJst } from "@/lib/date";
import { classifyCustomer } from "@/lib/segment/classify";
import type { Segment } from "@/lib/segment/types";
import { getSegmentSettings } from "@/lib/settings/read";
import { createServiceClient } from "@/lib/supabase/service";

const CODE_EXPIRES_MS = 14 * 24 * 60 * 60 * 1000; // 14日

export type IssueLinkCodeResult =
  | { ok: true; code: string; expiresAt: string }
  | { ok: false; message: string };

/**
 * 顧客専用の紐付けコードを発行する。未使用のコードが既にあれば、
 * それを失効させてから新しく発行する（顧客ごとに未使用は1個までという制約に合わせる）。
 */
export async function issueLinkCode(
  customerId: string,
): Promise<IssueLinkCodeResult> {
  await verifySession();
  const supabase = createServiceClient();

  const { error: deleteError } = await supabase
    .from("link_codes")
    .delete()
    .eq("customer_id", customerId)
    .is("used_at", null);
  if (deleteError) {
    return { ok: false, message: "既存コードの失効処理に失敗しました。" };
  }

  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + CODE_EXPIRES_MS).toISOString();

  const { error: insertError } = await supabase
    .from("link_codes")
    .insert({ code, customer_id: customerId, expires_at: expiresAt });
  if (insertError) {
    return {
      ok: false,
      message: "コードの発行に失敗しました。時間をおいて再度お試しください。",
    };
  }

  revalidatePath("/admin/customers");
  revalidatePath("/admin");
  return { ok: true, code, expiresAt };
}

export async function setSegmentOverride(
  customerId: string,
  segment: Segment | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  await verifySession();
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("customers")
    .update({ segment_override: segment })
    .eq("customer_id", customerId);
  if (error) {
    return { ok: false, message: "更新に失敗しました。" };
  }
  revalidatePath("/admin/customers");
  revalidatePath("/admin");
  return { ok: true };
}

export type CustomerDetail = {
  orders: {
    orderId: string;
    orderDate: string;
    productName: string;
    quantity: number;
    amount: number;
  }[];
  reason: string;
  computedSegment: Segment;
};

export async function fetchCustomerDetail(
  customerId: string,
): Promise<CustomerDetail> {
  await verifySession();
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("orders")
    .select("order_id, order_date, product_name, quantity, amount")
    .eq("customer_id", customerId)
    .order("order_date", { ascending: false });
  if (error) throw error;

  const settings = await getSegmentSettings();
  const referenceDate = settings.referenceDate ?? todayJst();
  const classification = classifyCustomer(
    (data ?? []).map((o) => ({
      customerId,
      orderDate: o.order_date,
      amount: Number(o.amount),
    })),
    {
      vipThreshold: settings.vipThreshold,
      repeatMonths: settings.repeatMonths,
    },
    referenceDate,
  );

  return {
    orders: (data ?? []).map((o) => ({
      orderId: o.order_id,
      orderDate: o.order_date,
      productName: o.product_name,
      quantity: o.quantity,
      amount: Number(o.amount),
    })),
    reason: classification.reason,
    computedSegment: classification.segment,
  };
}
