import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SEGMENT_SETTINGS, DEMO_REFERENCE_DATE } from "@/lib/config";
import type { OrderRow } from "@/lib/csv/types";
import { validateAndNormalizeCsv } from "@/lib/csv/validate";
import { previewImport, type ExistingOrder } from "@/lib/import/preview";
import {
  planSync,
  type MenuMap,
  type SyncCustomer,
} from "@/lib/richmenu/plan-sync";
import {
  classifyAll,
  countBySegment,
  diffSegments,
} from "@/lib/segment/classify";
import type { OrderLite, Segment } from "@/lib/segment/types";

/**
 * README.md「サンプルデータと正解値」の表を、実際の CSV から再現できるかを確認する。
 * ここが落ちたら、実装・サンプルデータ・README のどれかがずれている。
 */

function loadCsv(fileName: string): OrderRow[] {
  const text = readFileSync(
    path.resolve(process.cwd(), "data", fileName),
    "utf-8",
  );
  const result = validateAndNormalizeCsv(text, {
    referenceDate: DEMO_REFERENCE_DATE,
  });
  if (!result.ok) {
    throw new Error(
      `${fileName} の検証に失敗: ${JSON.stringify(result.errors)}`,
    );
  }
  return result.rows;
}

function toLite(rows: readonly OrderRow[]): OrderLite[] {
  return rows.map((r) => ({
    customerId: r.customerId,
    orderDate: r.orderDate,
    amount: r.amount,
  }));
}

function segmentMap(rows: readonly OrderRow[]): Map<string, Segment> {
  const result = classifyAll(
    toLite(rows),
    DEFAULT_SEGMENT_SETTINGS,
    DEMO_REFERENCE_DATE,
  );
  return new Map([...result].map(([id, c]) => [id, c.segment]));
}

const initialRows = loadCsv("sample-orders.csv");
const additionalRows = loadCsv("sample-orders-additional.csv");

// [顧客ID, 注文数, 累計購入額, 最終購入日, セグメント]（README「正解値 1」）
const EXPECTED_STAGE1: [string, number, number, string, Segment][] = [
  ["C001", 8, 40000, "2026-09-05", "vip"],
  ["C002", 6, 30000, "2026-09-10", "vip"],
  ["C003", 4, 34000, "2026-01-15", "vip"],
  ["C004", 7, 29500, "2026-09-08", "repeater"],
  ["C005", 2, 6000, "2026-08-12", "repeater"],
  ["C006", 3, 10000, "2026-09-03", "repeater"],
  ["C007", 2, 6000, "2026-03-30", "repeater"],
  ["C008", 2, 12000, "2026-09-20", "repeater"],
  ["C009", 2, 5000, "2026-09-18", "repeater"],
  ["C010", 2, 6000, "2026-03-29", "dormant"],
  ["C011", 3, 7500, "2025-12-08", "dormant"],
  ["C012", 2, 7000, "2026-01-20", "dormant"],
  ["C013", 1, 2000, "2026-09-15", "new"],
  ["C014", 1, 3000, "2026-09-17", "new"],
  ["C015", 1, 6000, "2026-02-14", "new"],
  ["C016", 1, 36000, "2026-08-30", "new"],
  ["C017", 1, 2500, "2026-09-19", "new"],
];

describe("正解値 1：初回 CSV の取り込み後", () => {
  it("48 件・売上合計 ¥242,500 になる", () => {
    expect(initialRows).toHaveLength(48);
    expect(initialRows.reduce((sum, r) => sum + r.amount, 0)).toBe(242500);
  });

  it("17 人それぞれの注文数・累計・最終購入日・セグメントが README の表と一致する", () => {
    const result = classifyAll(
      toLite(initialRows),
      DEFAULT_SEGMENT_SETTINGS,
      DEMO_REFERENCE_DATE,
    );
    expect(result.size).toBe(17);
    for (const [id, count, total, last, segment] of EXPECTED_STAGE1) {
      const c = result.get(id);
      expect(c, id).toBeDefined();
      expect(
        [c?.orderCount, c?.totalAmount, c?.lastOrderDate, c?.segment],
        id,
      ).toEqual([count, total, last, segment]);
    }
  });

  it("セグメント別人数は 新規 5 / リピーター 6 / VIP 3 / 休眠 3", () => {
    expect(countBySegment(segmentMap(initialRows).values())).toEqual({
      new: 5,
      repeater: 6,
      vip: 3,
      dormant: 3,
    });
  });
});

describe("正解値 2：追加 CSV の取り込み後", () => {
  const existingOrders = new Map<string, ExistingOrder>(
    initialRows.map((r) => [
      r.orderId,
      {
        customerId: r.customerId,
        orderDate: r.orderDate,
        productName: r.productName,
        quantity: r.quantity,
        amount: r.amount,
      },
    ]),
  );
  const existingCustomers = new Map(
    initialRows.map((r) => [r.customerId, r.customerEmail]),
  );
  const preview = previewImport({
    existingOrders,
    existingCustomers,
    rows: additionalRows,
  });

  it("追加 CSV は 7 行で、取り込まれるのは 5 件・重複 2 件はスキップ", () => {
    expect(additionalRows).toHaveLength(7);
    expect(preview.newOrders).toHaveLength(5);
    expect(preview.duplicateCount).toBe(2);
    expect(preview.conflictOrderIds).toEqual([]);
    expect(preview.canImport).toBe(true);
    expect(preview.newCustomerIds).toEqual(["C018"]);
  });

  it("同じ CSV をもう一度取り込んでも、新規は 0 件（二重に増えない）", () => {
    const merged = new Map(existingOrders);
    for (const r of preview.newOrders) {
      merged.set(r.orderId, {
        customerId: r.customerId,
        orderDate: r.orderDate,
        productName: r.productName,
        quantity: r.quantity,
        amount: r.amount,
      });
    }
    const again = previewImport({
      existingOrders: merged,
      existingCustomers: new Map([
        ...existingCustomers,
        ["C018", "customer018@example.com"],
      ]),
      rows: additionalRows,
    });
    expect(again.newOrders).toHaveLength(0);
    expect(again.duplicateCount).toBe(7);
  });

  const allRows = [...initialRows, ...preview.newOrders];
  const before = segmentMap(initialRows);
  const after = segmentMap(allRows);

  it("合計 53 件になり、セグメント別人数は 新規 5 / リピーター 7 / VIP 4 / 休眠 2（18 人）", () => {
    expect(allRows).toHaveLength(53);
    expect(after.size).toBe(18);
    expect(countBySegment(after.values())).toEqual({
      new: 5,
      repeater: 7,
      vip: 4,
      dormant: 2,
    });
  });

  it("セグメントが変わるのは C004・C010・C013 と、新規顧客 C018 だけ", () => {
    expect(diffSegments(before, after)).toEqual([
      { customerId: "C004", from: "repeater", to: "vip" },
      { customerId: "C010", from: "dormant", to: "repeater" },
      { customerId: "C013", from: "new", to: "repeater" },
      { customerId: "C018", from: null, to: "new" },
    ]);
  });

  it("全員が LINE と紐付け済み（C018 だけ未紐付け）として同期を計画すると、切替は C004・C010・C013 の 3 人だけ", () => {
    const menus: MenuMap = {
      new: "rm-new",
      repeater: "rm-repeater",
      vip: "rm-vip",
      dormant: "rm-dormant",
    };
    const customers: SyncCustomer[] = [...after].map(([id, segment]) => {
      const previous = before.get(id);
      return {
        customerId: id,
        lineUserId: id === "C018" ? null : `U-${id}`,
        segment,
        appliedRichMenuId: previous ? menus[previous]! : null,
        syncStatus: previous ? "in_sync" : "not_linked",
        syncRequestedAt: null,
      };
    });

    const plan = planSync(customers, menus, new Date("2026-09-30T12:00:00Z"));

    expect(plan.groups.map((g) => [g.richMenuId, g.customerIds])).toEqual([
      ["rm-repeater", ["C010", "C013"]],
      ["rm-vip", ["C004"]],
    ]);
    // 注文が増えてもリピーターのままの C005 は、LINE を呼ばない
    expect(plan.skipped).toContainEqual({
      customerId: "C005",
      reason: "up_to_date",
    });
    expect(plan.skipped).toContainEqual({
      customerId: "C018",
      reason: "not_linked",
    });
  });
});
