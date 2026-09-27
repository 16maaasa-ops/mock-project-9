import { describe, expect, it } from "vitest";
import {
  chunkGroup,
  planSync,
  type MenuMap,
  type SyncCustomer,
} from "@/lib/richmenu/plan-sync";

const MENUS: MenuMap = {
  new: "rm-new",
  repeater: "rm-repeater",
  vip: "rm-vip",
  dormant: "rm-dormant",
};
const NOW = new Date("2026-09-30T12:00:00Z");

function customer(over: Partial<SyncCustomer> = {}): SyncCustomer {
  return {
    customerId: "C001",
    lineUserId: "U001",
    segment: "vip",
    appliedRichMenuId: null,
    syncStatus: "pending",
    syncRequestedAt: null,
    ...over,
  };
}

describe("planSync: 依頼する顧客", () => {
  it("まだ何も適用していない顧客は、セグメントのメニューで依頼する", () => {
    const plan = planSync([customer()], MENUS, NOW);
    expect(plan.groups).toEqual([
      {
        richMenuId: "rm-vip",
        segment: "vip",
        customerIds: ["C001"],
        lineUserIds: ["U001"],
      },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it("適用済みのメニューと、あるべきメニューが違えば依頼する（反映済みでも）", () => {
    const plan = planSync(
      [customer({ appliedRichMenuId: "rm-repeater", syncStatus: "in_sync" })],
      MENUS,
      NOW,
    );
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0].richMenuId).toBe("rm-vip");
  });

  it("失敗（failed）のままの顧客は、メニューが同じでも再依頼する", () => {
    const plan = planSync(
      [customer({ appliedRichMenuId: "rm-vip", syncStatus: "failed" })],
      MENUS,
      NOW,
    );
    expect(plan.groups).toHaveLength(1);
  });

  it("依頼済みのまま一定時間が過ぎた顧客は、確認できていないので再依頼する", () => {
    const plan = planSync(
      [
        customer({
          appliedRichMenuId: "rm-vip",
          syncStatus: "requested",
          syncRequestedAt: "2026-09-30T11:00:00Z", // 1 時間前
        }),
      ],
      MENUS,
      NOW,
    );
    expect(plan.groups).toHaveLength(1);
  });

  it("依頼した後にセグメントが変わった顧客は、依頼済みでも新しいメニューで依頼する", () => {
    const plan = planSync(
      [
        customer({
          segment: "vip",
          appliedRichMenuId: "rm-repeater",
          syncStatus: "requested",
          syncRequestedAt: "2026-09-30T11:59:00Z",
        }),
      ],
      MENUS,
      NOW,
    );
    expect(plan.groups[0].richMenuId).toBe("rm-vip");
  });
});

describe("planSync: 依頼しない顧客", () => {
  it("反映済みで変化が無い顧客は対象外（README C005）", () => {
    const plan = planSync(
      [
        customer({
          customerId: "C005",
          segment: "repeater",
          appliedRichMenuId: "rm-repeater",
          syncStatus: "in_sync",
        }),
      ],
      MENUS,
      NOW,
    );
    expect(plan.groups).toEqual([]);
    expect(plan.skipped).toEqual([
      { customerId: "C005", reason: "up_to_date" },
    ]);
  });

  it("依頼した直後（10 分以内）で正しいメニューなら、確認待ちとして対象外", () => {
    const plan = planSync(
      [
        customer({
          appliedRichMenuId: "rm-vip",
          syncStatus: "requested",
          syncRequestedAt: "2026-09-30T11:55:00Z",
        }),
      ],
      MENUS,
      NOW,
    );
    expect(plan.skipped).toEqual([
      { customerId: "C001", reason: "awaiting_confirmation" },
    ]);
  });

  it("LINE 未紐付け・セグメント未判定・メニュー未登録は対象外（理由つき）", () => {
    const plan = planSync(
      [
        customer({ customerId: "A", lineUserId: null }),
        customer({ customerId: "B", segment: null }),
        customer({ customerId: "C", segment: "dormant" }),
      ],
      { new: "rm-new" },
      NOW,
    );
    expect(plan.groups).toEqual([]);
    expect(plan.skipped).toEqual([
      { customerId: "A", reason: "not_linked" },
      { customerId: "B", reason: "no_segment" },
      { customerId: "C", reason: "no_menu" },
    ]);
  });
});

describe("planSync: まとめ方", () => {
  it("メニューごとにまとめ、セグメント順・顧客ID順に並べる", () => {
    const plan = planSync(
      [
        customer({
          customerId: "C010",
          lineUserId: "U10",
          segment: "repeater",
        }),
        customer({ customerId: "C004", lineUserId: "U04", segment: "vip" }),
        customer({
          customerId: "C013",
          lineUserId: "U13",
          segment: "repeater",
        }),
      ],
      MENUS,
      NOW,
    );
    expect(plan.groups.map((g) => g.segment)).toEqual(["repeater", "vip"]);
    expect(plan.groups[0].customerIds).toEqual(["C010", "C013"]);
    expect(plan.groups[0].lineUserIds).toEqual(["U10", "U13"]);
  });
});

describe("chunkGroup", () => {
  it("指定人数ごとに分割し、顧客IDと LINE ユーザーIDの対応を保つ", () => {
    const group = {
      richMenuId: "rm-vip",
      segment: "vip" as const,
      customerIds: ["C1", "C2", "C3", "C4", "C5"],
      lineUserIds: ["U1", "U2", "U3", "U4", "U5"],
    };
    const chunks = chunkGroup(group, 2);
    expect(chunks.map((c) => c.customerIds)).toEqual([
      ["C1", "C2"],
      ["C3", "C4"],
      ["C5"],
    ]);
    expect(chunks.map((c) => c.lineUserIds)).toEqual([
      ["U1", "U2"],
      ["U3", "U4"],
      ["U5"],
    ]);
    expect(chunks.every((c) => c.richMenuId === "rm-vip")).toBe(true);
  });

  it("0 以下のサイズは例外", () => {
    expect(() =>
      chunkGroup(
        { richMenuId: "x", segment: "new", customerIds: [], lineUserIds: [] },
        0,
      ),
    ).toThrow(RangeError);
  });
});
