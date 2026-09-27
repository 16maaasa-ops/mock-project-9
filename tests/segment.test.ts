import { describe, expect, it } from "vitest";
import {
  classifyAll,
  classifyCustomer,
  countBySegment,
  diffSegments,
  effectiveSegment,
} from "@/lib/segment/classify";
import type { OrderLite, Segment } from "@/lib/segment/types";

const REF = "2026-09-30";
const SETTINGS = { vipThreshold: 30000, repeatMonths: 6 };

function orders(...items: [string, number][]): OrderLite[] {
  return items.map(([orderDate, amount]) => ({
    customerId: "C001",
    orderDate,
    amount,
  }));
}

describe("classifyCustomer: 新規", () => {
  it("注文が無ければ新規", () => {
    const result = classifyCustomer([], SETTINGS, REF);
    expect(result.segment).toBe("new");
    expect(result.lastOrderDate).toBeNull();
    expect(result.reason).toContain("購入履歴がない");
  });

  it("購入 1 回なら新規（半年以上前でも）", () => {
    expect(
      classifyCustomer(orders(["2026-02-14", 6000]), SETTINGS, REF).segment,
    ).toBe("new");
  });

  it("1 回で閾値を超えても VIP にはならず新規（README C016）", () => {
    expect(
      classifyCustomer(orders(["2026-08-30", 36000]), SETTINGS, REF).segment,
    ).toBe("new");
  });
});

describe("classifyCustomer: VIP", () => {
  it("累計が閾値ちょうど（以上）なら VIP（README C002）", () => {
    const result = classifyCustomer(
      orders(["2026-08-10", 15000], ["2026-09-10", 15000]),
      SETTINGS,
      REF,
    );
    expect(result.segment).toBe("vip");
    expect(result.reason).toContain("¥30,000");
  });

  it("閾値に 1 円足りなければ VIP ではない", () => {
    expect(
      classifyCustomer(
        orders(["2026-08-10", 15000], ["2026-09-10", 14999]),
        SETTINGS,
        REF,
      ).segment,
    ).toBe("repeater");
  });

  it("最終購入が 6 ヶ月より古くても VIP のまま（README C003）", () => {
    expect(
      classifyCustomer(
        orders(["2025-10-15", 20000], ["2026-01-15", 14000]),
        SETTINGS,
        REF,
      ).segment,
    ).toBe("vip");
  });
});

describe("classifyCustomer: リピーターと休眠の境界", () => {
  it("最終購入が 6 ヶ月前の同じ日ならリピーター（README C007）", () => {
    expect(
      classifyCustomer(
        orders(["2025-12-30", 3000], ["2026-03-30", 3000]),
        SETTINGS,
        REF,
      ).segment,
    ).toBe("repeater");
  });

  it("最終購入が 6 ヶ月前の 1 日前なら休眠（README C010）", () => {
    expect(
      classifyCustomer(
        orders(["2025-11-01", 3000], ["2026-03-29", 3000]),
        SETTINGS,
        REF,
      ).segment,
    ).toBe("dormant");
  });

  it("注文の並び順に関係なく最終購入日を選ぶ", () => {
    const result = classifyCustomer(
      orders(["2026-09-18", 3000], ["2026-01-10", 2000]),
      SETTINGS,
      REF,
    );
    expect(result.segment).toBe("repeater");
    expect(result.lastOrderDate).toBe("2026-09-18");
  });
});

describe("classifyCustomer: 設定と基準日", () => {
  it("閾値・期間を変えると結果が変わる", () => {
    const list = orders(["2026-07-01", 6000], ["2026-08-01", 6000]);
    expect(classifyCustomer(list, SETTINGS, REF).segment).toBe("repeater");
    expect(
      classifyCustomer(list, { vipThreshold: 10000, repeatMonths: 6 }, REF)
        .segment,
    ).toBe("vip");
    expect(
      classifyCustomer(list, { vipThreshold: 30000, repeatMonths: 1 }, REF)
        .segment,
    ).toBe("dormant");
  });

  it("基準日より後の注文は無視する（基準日を過去に戻したとき）", () => {
    const list = orders(
      ["2026-05-01", 3000],
      ["2026-09-01", 3000],
      ["2026-09-20", 3000],
    );
    // 基準日 2026-06-30 では 5/1 の 1 件だけが見える → 新規
    expect(classifyCustomer(list, SETTINGS, "2026-06-30").segment).toBe("new");
    expect(classifyCustomer(list, SETTINGS, REF).segment).toBe("repeater");
  });
});

describe("classifyAll / effectiveSegment / countBySegment / diffSegments", () => {
  it("顧客ごとにまとめて判定する", () => {
    const all: OrderLite[] = [
      { customerId: "A", orderDate: "2026-09-01", amount: 1000 },
      { customerId: "B", orderDate: "2026-08-01", amount: 1000 },
      { customerId: "B", orderDate: "2026-09-01", amount: 1000 },
    ];
    const result = classifyAll(all, SETTINGS, REF);
    expect(result.get("A")?.segment).toBe("new");
    expect(result.get("B")?.segment).toBe("repeater");
  });

  it("手動指定があれば優先する", () => {
    expect(effectiveSegment("dormant", "vip")).toBe("vip");
    expect(effectiveSegment("dormant", null)).toBe("dormant");
    expect(effectiveSegment("dormant", undefined)).toBe("dormant");
  });

  it("0 人のセグメントも 0 として数える", () => {
    const counts = countBySegment(["new", "new", "vip"] as Segment[]);
    expect(counts).toEqual({ new: 2, repeater: 0, vip: 1, dormant: 0 });
  });

  it("変わった顧客だけを、顧客ID順に返す（新規顧客は from が null）", () => {
    const before = new Map<string, Segment>([
      ["C002", "repeater"],
      ["C001", "new"],
      ["C003", "vip"],
    ]);
    const after = new Map<string, Segment>([
      ["C003", "vip"],
      ["C002", "vip"],
      ["C001", "repeater"],
      ["C004", "new"],
    ]);
    expect(diffSegments(before, after)).toEqual([
      { customerId: "C001", from: "new", to: "repeater" },
      { customerId: "C002", from: "repeater", to: "vip" },
      { customerId: "C004", from: null, to: "new" },
    ]);
  });
});
