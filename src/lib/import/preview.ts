import type { OrderRow } from "@/lib/csv/types";

/** DB にすでにある注文の内容（重複・内容相違の判定に使う）。 */
export type ExistingOrder = {
  customerId: string;
  orderDate: string;
  productName: string;
  quantity: number;
  amount: number;
};

export type CustomerConflict = {
  customerId: string;
  /** email_mismatch: 登録済みの顧客IDだが、メールアドレスが違う / email_in_use: 別の顧客IDが同じメールを使用中 */
  reason: "email_mismatch" | "email_in_use";
};

export type ImportPreview = {
  totalRows: number;
  /** 今回新しく取り込む注文。 */
  newOrders: OrderRow[];
  /** 注文IDも内容も同じ行（すでに取り込み済みなのでスキップする）。 */
  duplicateCount: number;
  /** 注文IDは同じなのに内容が違う行。上書きせずスキップし、運用者に報告する。 */
  conflictOrderIds: string[];
  newCustomerIds: string[];
  /** 1 件でもあれば、取り込み全体を拒否する。 */
  customerConflicts: CustomerConflict[];
  canImport: boolean;
};

function sameContent(existing: ExistingOrder, row: OrderRow): boolean {
  return (
    existing.customerId === row.customerId &&
    existing.orderDate === row.orderDate &&
    existing.productName === row.productName &&
    existing.quantity === row.quantity &&
    existing.amount === row.amount
  );
}

/**
 * 取り込む前に、CSV の内容が既存データに対して何を意味するかを数える。
 * 「取り込み前の確認画面」の表示と、テストでの正解値の確認に使う。
 * 実際の書き込みは DB 関数（import_orders）が 1 つのトランザクションで行い、
 * この関数はそれと同じ規則を、書き込み無しで再現するもの。
 */
export function previewImport(input: {
  existingOrders: ReadonlyMap<string, ExistingOrder>;
  /** 顧客ID → メールアドレス */
  existingCustomers: ReadonlyMap<string, string>;
  rows: readonly OrderRow[];
}): ImportPreview {
  const { existingOrders, existingCustomers, rows } = input;

  const newOrders: OrderRow[] = [];
  const conflictOrderIds: string[] = [];
  let duplicateCount = 0;

  for (const row of rows) {
    const existing = existingOrders.get(row.orderId);
    if (!existing) {
      newOrders.push(row);
    } else if (sameContent(existing, row)) {
      duplicateCount += 1;
    } else {
      conflictOrderIds.push(row.orderId);
    }
  }

  const customerByEmail = new Map<string, string>();
  for (const [customerId, email] of existingCustomers) {
    customerByEmail.set(email, customerId);
  }

  const seen = new Set<string>();
  const newCustomerIds: string[] = [];
  const customerConflicts: CustomerConflict[] = [];

  for (const row of rows) {
    if (seen.has(row.customerId)) continue;
    seen.add(row.customerId);

    const knownEmail = existingCustomers.get(row.customerId);
    if (knownEmail !== undefined) {
      if (knownEmail !== row.customerEmail) {
        customerConflicts.push({
          customerId: row.customerId,
          reason: "email_mismatch",
        });
      }
      continue;
    }

    const owner = customerByEmail.get(row.customerEmail);
    if (owner !== undefined && owner !== row.customerId) {
      customerConflicts.push({
        customerId: row.customerId,
        reason: "email_in_use",
      });
    } else {
      newCustomerIds.push(row.customerId);
    }
  }

  return {
    totalRows: rows.length,
    newOrders,
    duplicateCount,
    conflictOrderIds,
    newCustomerIds,
    customerConflicts,
    canImport: customerConflicts.length === 0,
  };
}
