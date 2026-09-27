import { addMonths } from "@/lib/date";
import { formatYen } from "@/lib/format";
import {
  SEGMENTS,
  type Classification,
  type OrderLite,
  type Segment,
  type SegmentChange,
  type SegmentSettings,
} from "./types";

/**
 * 1 人の顧客をセグメントに分類する（AI は使わず、ルールだけで決める）。
 *
 * 判定は上から順に行い、最初に当てはまったもので確定する:
 *   1. 購入回数が 1 回以下            → 新規
 *   2. 累計購入額 ≧ VIP 閾値          → VIP
 *   3. 最終購入日 ≧ 基準日の N ヶ月前 → リピーター
 *   4. 上記以外                       → 休眠
 *
 * 基準日より後の注文は「まだ起きていないこと」として無視する。
 * （設定画面で基準日を過去に戻したときも、その時点の状態を正しく再現するため）
 */
export function classifyCustomer(
  orders: readonly OrderLite[],
  settings: SegmentSettings,
  referenceDate: string,
): Classification {
  const visible = orders.filter((order) => order.orderDate <= referenceDate);
  const orderCount = visible.length;
  const totalAmount = visible.reduce((sum, order) => sum + order.amount, 0);
  const lastOrderDate = visible.reduce<string | null>(
    (latest, order) =>
      latest === null || order.orderDate > latest ? order.orderDate : latest,
    null,
  );
  const base = { orderCount, totalAmount, lastOrderDate };

  if (orderCount <= 1) {
    const reason =
      orderCount === 0
        ? "購入履歴がないため、新規として扱います。"
        : "購入回数が 1 回のため、新規として扱います。";
    return { segment: "new", reason, ...base };
  }

  if (totalAmount >= settings.vipThreshold) {
    return {
      segment: "vip",
      reason: `累計購入額 ${formatYen(totalAmount)} が VIP の基準 ${formatYen(settings.vipThreshold)} 以上です。`,
      ...base,
    };
  }

  // 「N ヶ月前の同じ日」を含めて、それ以降ならリピーター
  const cutoff = addMonths(referenceDate, -settings.repeatMonths);
  if (lastOrderDate !== null && lastOrderDate >= cutoff) {
    return {
      segment: "repeater",
      reason: `購入 ${orderCount} 回で、最終購入日 ${lastOrderDate} が ${cutoff}（基準日の ${settings.repeatMonths} ヶ月前）以降です。`,
      ...base,
    };
  }

  return {
    segment: "dormant",
    reason: `購入 ${orderCount} 回ですが、最終購入日 ${lastOrderDate} が ${cutoff}（基準日の ${settings.repeatMonths} ヶ月前）より前です。`,
    ...base,
  };
}

/** 全注文を顧客ごとにまとめて、全員分を判定する。 */
export function classifyAll(
  orders: readonly OrderLite[],
  settings: SegmentSettings,
  referenceDate: string,
): Map<string, Classification> {
  const byCustomer = new Map<string, OrderLite[]>();
  for (const order of orders) {
    const list = byCustomer.get(order.customerId);
    if (list) list.push(order);
    else byCustomer.set(order.customerId, [order]);
  }

  const result = new Map<string, Classification>();
  for (const [customerId, customerOrders] of byCustomer) {
    result.set(
      customerId,
      classifyCustomer(customerOrders, settings, referenceDate),
    );
  }
  return result;
}

/** 手動指定（override）があればそちらを優先した、実際に適用するセグメント。 */
export function effectiveSegment(
  computed: Segment,
  override: Segment | null | undefined,
): Segment {
  return override ?? computed;
}

/** セグメント別の人数。0 人のセグメントも 0 として含める。 */
export function countBySegment(
  segments: Iterable<Segment>,
): Record<Segment, number> {
  const counts = Object.fromEntries(SEGMENTS.map((s) => [s, 0])) as Record<
    Segment,
    number
  >;
  for (const segment of segments) counts[segment] += 1;
  return counts;
}

/**
 * 変更前後のセグメントを比べて、変わった顧客だけを返す。
 * 「設定を変えると何人のメニューが切り替わるか」の事前表示と、
 * CSV 取り込み後に切り替える対象の特定に使う。
 */
export function diffSegments(
  before: ReadonlyMap<string, Segment>,
  after: ReadonlyMap<string, Segment>,
): SegmentChange[] {
  const changes: SegmentChange[] = [];
  for (const [customerId, to] of after) {
    const from = before.get(customerId) ?? null;
    if (from !== to) changes.push({ customerId, from, to });
  }
  return changes.sort((a, b) => a.customerId.localeCompare(b.customerId));
}
