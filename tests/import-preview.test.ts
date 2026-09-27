import { describe, expect, it } from "vitest";
import type { OrderRow } from "@/lib/csv/types";
import { previewImport, type ExistingOrder } from "@/lib/import/preview";

function row(over: Partial<OrderRow> = {}): OrderRow {
  return {
    orderId: "O-1",
    orderDate: "2026-09-01",
    customerId: "C001",
    customerEmail: "c001@example.com",
    productName: "定期便Sサイズ",
    quantity: 1,
    amount: 3000,
    ...over,
  };
}

function existing(o: OrderRow): ExistingOrder {
  return {
    customerId: o.customerId,
    orderDate: o.orderDate,
    productName: o.productName,
    quantity: o.quantity,
    amount: o.amount,
  };
}

describe("previewImport", () => {
  it("既存に無い注文は新規として数え、新しい顧客も数える", () => {
    const preview = previewImport({
      existingOrders: new Map(),
      existingCustomers: new Map(),
      rows: [row(), row({ orderId: "O-2" })],
    });
    expect(preview.newOrders).toHaveLength(2);
    expect(preview.newCustomerIds).toEqual(["C001"]);
    expect(preview.duplicateCount).toBe(0);
    expect(preview.canImport).toBe(true);
  });

  it("注文IDも内容も同じ行は、重複としてスキップする", () => {
    const r = row();
    const preview = previewImport({
      existingOrders: new Map([["O-1", existing(r)]]),
      existingCustomers: new Map([["C001", "c001@example.com"]]),
      rows: [r],
    });
    expect(preview.newOrders).toEqual([]);
    expect(preview.duplicateCount).toBe(1);
    expect(preview.conflictOrderIds).toEqual([]);
    expect(preview.newCustomerIds).toEqual([]);
  });

  it("注文IDは同じで内容が違う行は、上書きせず「内容相違」として報告する", () => {
    const preview = previewImport({
      existingOrders: new Map([["O-1", existing(row())]]),
      existingCustomers: new Map([["C001", "c001@example.com"]]),
      rows: [row({ amount: 9999 })],
    });
    expect(preview.newOrders).toEqual([]);
    expect(preview.duplicateCount).toBe(0);
    expect(preview.conflictOrderIds).toEqual(["O-1"]);
    expect(preview.canImport).toBe(true);
  });

  it("登録済みの顧客IDでメールアドレスが違えば、取り込み全体を不可にする", () => {
    const preview = previewImport({
      existingOrders: new Map(),
      existingCustomers: new Map([["C001", "old@example.com"]]),
      rows: [row()],
    });
    expect(preview.customerConflicts).toEqual([
      { customerId: "C001", reason: "email_mismatch" },
    ]);
    expect(preview.canImport).toBe(false);
  });

  it("新しい顧客IDのメールアドレスが、別の顧客に使われていれば不可にする", () => {
    const preview = previewImport({
      existingOrders: new Map(),
      existingCustomers: new Map([["C999", "c001@example.com"]]),
      rows: [row()],
    });
    expect(preview.customerConflicts).toEqual([
      { customerId: "C001", reason: "email_in_use" },
    ]);
    expect(preview.canImport).toBe(false);
  });
});
