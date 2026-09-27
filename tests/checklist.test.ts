import { describe, expect, it } from "vitest";
import { buildInitialChecklist } from "@/lib/dashboard/checklist";

describe("buildInitialChecklist", () => {
  it("何も終わっていない状態では、全項目が未完了", () => {
    const items = buildInitialChecklist({
      lineConnected: false,
      richMenuSlotsRegistered: 0,
      ordersImported: false,
      codesIssued: false,
    });
    expect(items.every((i) => !i.done)).toBe(true);
    expect(items).toHaveLength(4);
  });

  it("メニューは5枠揃って初めて完了になる（4枠ではまだ）", () => {
    const items = buildInitialChecklist({
      lineConnected: true,
      richMenuSlotsRegistered: 4,
      ordersImported: false,
      codesIssued: false,
    });
    expect(items.find((i) => i.key === "menus")?.done).toBe(false);
  });

  it("全部終わっていれば全項目が完了", () => {
    const items = buildInitialChecklist({
      lineConnected: true,
      richMenuSlotsRegistered: 5,
      ordersImported: true,
      codesIssued: true,
    });
    expect(items.every((i) => i.done)).toBe(true);
  });
});
