import { describe, expect, it } from "vitest";
import { MAX_CSV_ROWS } from "@/lib/config";
import { looksMojibake, normalizeDate, stripBom } from "@/lib/csv/parse";
import { validateAndNormalizeCsv } from "@/lib/csv/validate";

const HEADER =
  "order_id,order_date,customer_id,customer_email,product_name,quantity,amount";

function line(over: Partial<Record<string, string>> = {}): string {
  const base = {
    order_id: "O-0001",
    order_date: "2026-09-03",
    customer_id: "C001",
    customer_email: "customer001@example.com",
    product_name: "定期便Sサイズ",
    quantity: "1",
    amount: "3000",
    ...over,
  };
  return [
    base.order_id,
    base.order_date,
    base.customer_id,
    base.customer_email,
    base.product_name,
    base.quantity,
    base.amount,
  ].join(",");
}

function csv(...lines: string[]): string {
  return [HEADER, ...lines].join("\n");
}

describe("normalizeDate / stripBom / looksMojibake", () => {
  it("ISO 形式とゼロ埋め無しの日付を正規化する", () => {
    expect(normalizeDate("2026-09-03")).toBe("2026-09-03");
    expect(normalizeDate("2026/9/3")).toBe("2026-09-03");
  });

  it("実在しない日付・日付でない文字列は null", () => {
    expect(normalizeDate("2026-02-30")).toBeNull();
    expect(normalizeDate("not-a-date")).toBeNull();
  });

  it("BOM を除去する", () => {
    expect(stripBom("﻿order_id")).toBe("order_id");
    expect(stripBom("order_id")).toBe("order_id");
  });

  it("置換文字があれば文字化けと判定する", () => {
    expect(looksMojibake("��")).toBe(true);
    expect(looksMojibake("定期便")).toBe(false);
  });
});

describe("validateAndNormalizeCsv: 正常系", () => {
  it("正しい行を正規化して返す（メールは小文字化・前後の空白除去）", () => {
    const result = validateAndNormalizeCsv(
      csv(
        line({
          customer_email: "  Customer001@Example.COM ",
          order_date: "2026/9/3",
        }),
      ),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows[0]).toEqual({
        orderId: "O-0001",
        orderDate: "2026-09-03",
        customerId: "C001",
        customerEmail: "customer001@example.com",
        productName: "定期便Sサイズ",
        quantity: 1,
        amount: 3000,
      });
    }
  });

  it("先頭に BOM が付いていても読める", () => {
    expect(validateAndNormalizeCsv(`﻿${csv(line())}`).ok).toBe(true);
  });

  it("Windows の改行（CRLF）でも読める", () => {
    const text = [HEADER, line(), line({ order_id: "O-0002" })].join("\r\n");
    const result = validateAndNormalizeCsv(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows).toHaveLength(2);
  });

  it("金額 0 円（サンプル配布など）は受け付ける", () => {
    expect(validateAndNormalizeCsv(csv(line({ amount: "0" }))).ok).toBe(true);
  });

  it("基準日と同じ日付の注文は受け付ける", () => {
    const result = validateAndNormalizeCsv(
      csv(line({ order_date: "2026-09-30" })),
      {
        referenceDate: "2026-09-30",
      },
    );
    expect(result.ok).toBe(true);
  });
});

describe("validateAndNormalizeCsv: ファイル全体のエラー", () => {
  it("文字化けを検出する", () => {
    const result = validateAndNormalizeCsv(`${HEADER}\n��`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].message).toContain("文字化け");
  });

  it("必須列が足りなければ、足りない列名を示す", () => {
    const result = validateAndNormalizeCsv(
      "order_id,order_date\nO-1,2026-09-03",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("customer_email");
      expect(result.errors[0].message).toContain("amount");
    }
  });

  it("データ行が無ければエラー", () => {
    const result = validateAndNormalizeCsv(HEADER);
    expect(result.ok).toBe(false);
  });

  it("行数が上限を超えたらエラー", () => {
    const lines = Array.from({ length: MAX_CSV_ROWS + 1 }, (_, i) =>
      line({ order_id: `O-${i}` }),
    );
    const result = validateAndNormalizeCsv(csv(...lines));
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors[0].message).toContain("行数が多すぎます");
  });
});

describe("validateAndNormalizeCsv: 行のエラー（全件拒否・行番号つき）", () => {
  it("1 行でも不正なら全件拒否し、全ての不正行を行番号つきで返す", () => {
    const result = validateAndNormalizeCsv(
      csv(
        line({ order_id: "O-1" }),
        line({ order_id: "O-2", order_date: "2026-02-30" }),
        line({ order_id: "O-3", quantity: "0" }),
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((e) => e.row)).toEqual([3, 4]);
      expect(result.errors[0].message).toContain("order_date");
      expect(result.errors[1].message).toContain("quantity");
    }
  });

  it("金額が負・カンマ付き・小数なら拒否する", () => {
    for (const amount of ["-100", "1,000", "10.5", ""]) {
      const result = validateAndNormalizeCsv(
        csv(line({ amount: `"${amount}"` })),
      );
      expect(result.ok, `amount=${amount}`).toBe(false);
    }
  });

  it("空の注文ID・顧客ID・商品名を拒否する", () => {
    for (const over of [
      { order_id: "" },
      { customer_id: "" },
      { product_name: "" },
    ]) {
      expect(validateAndNormalizeCsv(csv(line(over))).ok).toBe(false);
    }
  });

  it("基準日より後の注文日を拒否する", () => {
    const result = validateAndNormalizeCsv(
      csv(line({ order_date: "2026-10-01" })),
      {
        referenceDate: "2026-09-30",
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].message).toContain("基準日");
  });

  it("メールの形式が不正なら拒否し、エラー文にアドレスを含めない（個人情報）", () => {
    const result = validateAndNormalizeCsv(
      csv(line({ customer_email: "secret-person-at-example.com" })),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].message).not.toContain("secret-person");
    }
  });
});

describe("validateAndNormalizeCsv: 行をまたぐ整合性", () => {
  it("同じ注文IDがファイル内に 2 回あれば拒否する", () => {
    const result = validateAndNormalizeCsv(csv(line(), line()));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].row).toBe(3);
      expect(result.errors[0].message).toContain("2 行目と重複");
    }
  });

  it("同じ顧客IDでメールアドレスが違えば拒否する", () => {
    const result = validateAndNormalizeCsv(
      csv(
        line({ order_id: "O-1" }),
        line({ order_id: "O-2", customer_email: "other@example.com" }),
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].row).toBe(3);
  });

  it("同じメールアドレスが別の顧客IDに使われていれば拒否する", () => {
    const result = validateAndNormalizeCsv(
      csv(
        line({ order_id: "O-1", customer_id: "C001" }),
        line({ order_id: "O-2", customer_id: "C002" }),
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].message).toContain("1 対 1");
  });

  it("同じ顧客が複数注文しても（メールが同じなら）問題ない", () => {
    const result = validateAndNormalizeCsv(
      csv(line({ order_id: "O-1" }), line({ order_id: "O-2" })),
    );
    expect(result.ok).toBe(true);
  });
});
