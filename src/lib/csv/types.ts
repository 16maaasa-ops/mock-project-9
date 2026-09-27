/** CSV 1 行（＝ 1 注文）を検証・正規化した結果。README の 7 列と対応する。 */
export type OrderRow = {
  orderId: string;
  orderDate: string; // "YYYY-MM-DD"
  customerId: string;
  customerEmail: string; // 小文字化・前後の空白除去済み
  productName: string;
  quantity: number;
  amount: number;
};

/** row はファイル上の行番号（1 行目がヘッダーなので、データの 1 件目は 2）。0 はファイル全体の問題。 */
export type CsvValidationError = { row: number; message: string };

export type CsvParseResult =
  { ok: true; rows: OrderRow[] } | { ok: false; errors: CsvValidationError[] };
