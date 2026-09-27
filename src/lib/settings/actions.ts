"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/auth/dal";
import { todayJst } from "@/lib/date";
import { diffSegments } from "@/lib/segment/classify";
import { computeEffectiveSegments } from "@/lib/segment/recompute";
import type { SegmentChange } from "@/lib/segment/types";
import { createServiceClient } from "@/lib/supabase/service";
import { getSegmentSettings } from "./read";

export type SettingsInput = {
  vipThreshold: number;
  repeatMonths: number;
  referenceDate: string | null;
};

function validate(input: SettingsInput): string | null {
  if (!Number.isFinite(input.vipThreshold) || input.vipThreshold <= 0) {
    return "VIPの閾値は1円以上の数値にしてください。";
  }
  if (!Number.isInteger(input.repeatMonths) || input.repeatMonths <= 0) {
    return "リピーターの期間は1ヶ月以上の整数にしてください。";
  }
  if (
    input.referenceDate !== null &&
    !/^\d{4}-\d{2}-\d{2}$/.test(input.referenceDate)
  ) {
    return "基準日の形式が正しくありません。";
  }
  return null;
}

/** 設定を変更した場合に、何人のセグメントが変わるかを事前に計算する（保存はしない）。 */
export async function previewSegmentSettingsChange(
  input: SettingsInput,
): Promise<
  { ok: true; changes: SegmentChange[] } | { ok: false; error: string }
> {
  await verifySession();
  const validationError = validate(input);
  if (validationError) return { ok: false, error: validationError };

  const current = await getSegmentSettings();
  const referenceDate = current.referenceDate ?? todayJst();

  const before = await computeEffectiveSegments(
    { vipThreshold: current.vipThreshold, repeatMonths: current.repeatMonths },
    referenceDate,
  );
  const after = await computeEffectiveSegments(
    { vipThreshold: input.vipThreshold, repeatMonths: input.repeatMonths },
    input.referenceDate ?? referenceDate,
  );

  return { ok: true, changes: diffSegments(before, after) };
}

/** 設定を保存し、全顧客のセグメントを再計算して書き戻す。 */
export async function updateSegmentSettings(
  input: SettingsInput,
): Promise<{ ok: true; changedCount: number } | { ok: false; error: string }> {
  await verifySession();
  const validationError = validate(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = createServiceClient();
  const { error: updateError } = await supabase
    .from("segment_settings")
    .update({
      vip_threshold: input.vipThreshold,
      repeat_months: input.repeatMonths,
      reference_date: input.referenceDate,
    })
    .eq("id", true);
  if (updateError) throw updateError;

  // segment_settings はすでに新しい値で更新済みなので、ここで計算すれば
  // そのまま新しい設定に基づくセグメントが手に入る
  const referenceDate = input.referenceDate ?? todayJst();
  const recalculated = await computeEffectiveSegments(
    { vipThreshold: input.vipThreshold, repeatMonths: input.repeatMonths },
    referenceDate,
  );

  // 小規模（数十〜百件）想定なので、顧客ごとに更新する（一括SQLは導入しない）
  await Promise.all(
    [...recalculated].map(([customerId, segment]) =>
      supabase
        .from("customers")
        .update({ segment })
        .eq("customer_id", customerId),
    ),
  );

  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/customers");

  return { ok: true, changedCount: recalculated.size };
}
