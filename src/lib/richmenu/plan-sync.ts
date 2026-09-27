import { REQUESTED_STALE_MS } from "@/lib/config";
import { SEGMENTS, type Segment } from "@/lib/segment/types";

export type SyncStatus =
  | "not_linked" // LINE と未紐付け
  | "pending" // 反映待ち（まだ LINE に依頼していない）
  | "requested" // LINE に依頼済み（受付されただけで、反映は未確認）
  | "in_sync" // 反映を確認済み
  | "failed"; // 反映できなかった

export type SyncCustomer = {
  customerId: string;
  lineUserId: string | null;
  /** 実際に適用するセグメント（手動指定を反映済み）。まだ判定されていなければ null。 */
  segment: Segment | null;
  /** 最後に LINE へ依頼したメニュー ID。 */
  appliedRichMenuId: string | null;
  syncStatus: SyncStatus;
  /** 依頼した日時（ISO 形式の文字列）。 */
  syncRequestedAt: string | null;
};

/** セグメント → LINE のリッチメニュー ID。未登録のセグメントは含まれない。 */
export type MenuMap = Partial<Record<Segment, string>>;

export type SyncGroup = {
  richMenuId: string;
  segment: Segment;
  customerIds: string[];
  lineUserIds: string[];
};

export type SkipReason =
  | "not_linked"
  | "no_segment"
  | "no_menu"
  | "up_to_date"
  | "awaiting_confirmation";

export type SyncPlan = {
  groups: SyncGroup[];
  skipped: { customerId: string; reason: SkipReason }[];
};

/**
 * 「今、LINE に依頼すべき顧客」を、依頼先のメニューごとにまとめる。
 * 変化がない顧客を毎回送り直さないのが目的（LINE への無駄な呼び出しと、
 * 失敗の巻き込みを減らす）。
 *
 * 依頼する顧客:
 *  - 適用したメニューと、あるべきメニューが違う
 *  - 反映待ち（pending）・失敗（failed）のまま
 *  - 依頼済み（requested）のまま一定時間が過ぎた（確認できていないので再依頼する）
 * 依頼しない顧客:
 *  - LINE と未紐付け／セグメント未判定／そのセグメントのメニューが未登録
 *  - すでに正しいメニューを反映済み（in_sync）
 *  - 正しいメニューを依頼した直後（requested）で、確認待ち
 */
export function planSync(
  customers: readonly SyncCustomer[],
  menus: MenuMap,
  now: Date = new Date(),
  staleMs: number = REQUESTED_STALE_MS,
): SyncPlan {
  const skipped: SyncPlan["skipped"] = [];
  const bySegment = new Map<Segment, SyncGroup>();

  for (const customer of customers) {
    if (customer.lineUserId === null) {
      skipped.push({ customerId: customer.customerId, reason: "not_linked" });
      continue;
    }
    if (customer.segment === null) {
      skipped.push({ customerId: customer.customerId, reason: "no_segment" });
      continue;
    }
    const target = menus[customer.segment];
    if (target === undefined) {
      skipped.push({ customerId: customer.customerId, reason: "no_menu" });
      continue;
    }

    if (customer.appliedRichMenuId === target) {
      if (customer.syncStatus === "in_sync") {
        skipped.push({ customerId: customer.customerId, reason: "up_to_date" });
        continue;
      }
      if (customer.syncStatus === "requested") {
        const requestedAt = customer.syncRequestedAt
          ? Date.parse(customer.syncRequestedAt)
          : Number.NaN;
        const isFresh =
          Number.isFinite(requestedAt) &&
          now.getTime() - requestedAt <= staleMs;
        if (isFresh) {
          skipped.push({
            customerId: customer.customerId,
            reason: "awaiting_confirmation",
          });
          continue;
        }
      }
    }

    let group = bySegment.get(customer.segment);
    if (!group) {
      group = {
        richMenuId: target,
        segment: customer.segment,
        customerIds: [],
        lineUserIds: [],
      };
      bySegment.set(customer.segment, group);
    }
    group.customerIds.push(customer.customerId);
    group.lineUserIds.push(customer.lineUserId);
  }

  // 出力の順序を固定する（テストと画面表示が毎回同じになるように）
  const groups = SEGMENTS.flatMap((segment) => {
    const group = bySegment.get(segment);
    if (!group) return [];
    const order = group.customerIds
      .map((id, index) => ({ id, lineUserId: group.lineUserIds[index] }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return [
      {
        ...group,
        customerIds: order.map((o) => o.id),
        lineUserIds: order.map((o) => o.lineUserId),
      },
    ];
  });

  return { groups, skipped };
}

/** LINE の一括 API に 1 回で送る人数に合わせて、グループを分割する。 */
export function chunkGroup(group: SyncGroup, size: number): SyncGroup[] {
  if (size < 1) throw new RangeError("size は 1 以上にしてください");
  const chunks: SyncGroup[] = [];
  for (let start = 0; start < group.customerIds.length; start += size) {
    chunks.push({
      ...group,
      customerIds: group.customerIds.slice(start, start + size),
      lineUserIds: group.lineUserIds.slice(start, start + size),
    });
  }
  return chunks;
}
