import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { DEFAULT_SEGMENT_SETTINGS } from "@/lib/config";

export type SegmentSettingsRow = {
  vipThreshold: number;
  repeatMonths: number;
  referenceDate: string | null; // 固定していなければ null（今日 JST が基準）
};

export async function getSegmentSettings(): Promise<SegmentSettingsRow> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("segment_settings")
    .select("vip_threshold, repeat_months, reference_date")
    .eq("id", true)
    .single();
  if (error) throw error;

  return {
    vipThreshold: data.vip_threshold ?? DEFAULT_SEGMENT_SETTINGS.vipThreshold,
    repeatMonths: data.repeat_months ?? DEFAULT_SEGMENT_SETTINGS.repeatMonths,
    referenceDate: data.reference_date,
  };
}
