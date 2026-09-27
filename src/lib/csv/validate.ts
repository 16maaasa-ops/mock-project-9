import { MAX_CSV_ROWS, REQUIRED_CSV_COLUMNS } from "@/lib/config";
import type { CsvParseResult, CsvValidationError, OrderRow } from "./types";
import { looksMojibake, normalizeDate, parseCsvText, stripBom } from "./parse";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ID_LENGTH = 64;
const MAX_EMAIL_LENGTH = 254;

function parseNonNegativeInt(raw: string | undefined): number | null {
  const trimmed = (raw ?? "").trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

export type ValidateOptions = {
  /** この日付より後の注文日はエラーにする（未来の注文は取り込めない）。 */
  referenceDate?: string;
};

/**
 * CSV 全体を検証・正規化する。1 行でもエラーがあれば「全件拒否」し、
 * 全エラーを行番号つきで返す（一部の行だけ黙って捨てると、累計購入額が
 * 静かにずれてセグメント判定が狂うため）。
 *
 * エラー文言は必ず「どこが・何が・どう直せばよいか」の 3 点セットにする。
 */
export function validateAndNormalizeCsv(
  rawText: string,
  options: ValidateOptions = {},
): CsvParseResult {
  const text = stripBom(rawText);

  if (looksMojibake(text)) {
    return {
      ok: false,
      errors: [
        {
          row: 0,
          message:
            "文字化けしています。Excel の「名前を付けて保存」で「CSV UTF-8」を選んで保存し直してください。",
        },
      ],
    };
  }

  const { headers, rows } = parseCsvText(text);

  const missingColumns = REQUIRED_CSV_COLUMNS.filter(
    (column) => !headers.includes(column),
  );
  if (missingColumns.length > 0) {
    return {
      ok: false,
      errors: [
        {
          row: 1,
          message: `必要な列が見つかりません（${missingColumns.join("、")}）。1 行目の列名を確認してください。`,
        },
      ],
    };
  }

  if (rows.length === 0) {
    return {
      ok: false,
      errors: [
        {
          row: 0,
          message:
            "データの行がありません。2 行目以降に注文を入力してください。",
        },
      ],
    };
  }

  if (rows.length > MAX_CSV_ROWS) {
    return {
      ok: false,
      errors: [
        {
          row: 0,
          message: `行数が多すぎます（${rows.length} 行）。${MAX_CSV_ROWS} 行以内に分けて取り込んでください。`,
        },
      ],
    };
  }

  const errors: CsvValidationError[] = [];
  const normalized: OrderRow[] = [];

  // ファイル内の重複チェック用（注文 ID・顧客 ID とメールの 1 対 1 対応）
  const orderIdRows = new Map<string, number>();
  const emailByCustomer = new Map<string, string>();
  const customerByEmail = new Map<string, string>();

  rows.forEach((raw, index) => {
    // 1 行目はヘッダーなので、データの 1 件目はファイル上の 2 行目
    const fileRow = index + 2;
    const rowErrors: string[] = [];

    const orderId = (raw.order_id ?? "").trim();
    if (orderId === "") {
      rowErrors.push("order_id（注文ID）が空です。");
    } else if (orderId.length > MAX_ID_LENGTH) {
      rowErrors.push(
        `order_id（注文ID）が長すぎます（${MAX_ID_LENGTH} 文字以内）。`,
      );
    } else {
      const firstRow = orderIdRows.get(orderId);
      if (firstRow !== undefined) {
        rowErrors.push(
          `order_id「${orderId}」が ${firstRow} 行目と重複しています。同じ注文が 2 回入っていないか確認してください。`,
        );
      } else {
        orderIdRows.set(orderId, fileRow);
      }
    }

    const orderDateRaw = (raw.order_date ?? "").trim();
    const orderDate = normalizeDate(orderDateRaw);
    if (!orderDate) {
      rowErrors.push(
        `order_date（注文日）が「${orderDateRaw}」になっています。「2026-09-03」または「2026/9/3」の形式にしてください。`,
      );
    } else if (options.referenceDate && orderDate > options.referenceDate) {
      rowErrors.push(
        `order_date（注文日）${orderDate} が基準日 ${options.referenceDate} より後になっています。基準日以前の日付にするか、設定画面で基準日を変更してください。`,
      );
    }

    const customerId = (raw.customer_id ?? "").trim();
    if (customerId === "") {
      rowErrors.push("customer_id（顧客ID）が空です。");
    } else if (customerId.length > MAX_ID_LENGTH) {
      rowErrors.push(
        `customer_id（顧客ID）が長すぎます（${MAX_ID_LENGTH} 文字以内）。`,
      );
    }

    const customerEmail = (raw.customer_email ?? "").trim().toLowerCase();
    if (
      !EMAIL_PATTERN.test(customerEmail) ||
      customerEmail.length > MAX_EMAIL_LENGTH
    ) {
      // メールアドレスは個人情報なので、エラー文言には値を含めない
      rowErrors.push(
        "customer_email（メールアドレス）の形式が正しくありません。「name@example.com」の形式にしてください。",
      );
    } else if (customerId !== "") {
      const knownEmail = emailByCustomer.get(customerId);
      const knownCustomer = customerByEmail.get(customerEmail);
      if (knownEmail !== undefined && knownEmail !== customerEmail) {
        rowErrors.push(
          `customer_id「${customerId}」のメールアドレスが、他の行と異なっています。同じ顧客には同じメールアドレスを入力してください。`,
        );
      } else if (knownCustomer !== undefined && knownCustomer !== customerId) {
        rowErrors.push(
          `同じメールアドレスが、別の customer_id「${knownCustomer}」の行にも使われています。顧客 ID とメールアドレスは 1 対 1 にしてください。`,
        );
      } else {
        emailByCustomer.set(customerId, customerEmail);
        customerByEmail.set(customerEmail, customerId);
      }
    }

    const productName = (raw.product_name ?? "").trim();
    if (productName === "") {
      rowErrors.push("product_name（商品名）が空です。");
    }

    const quantity = parseNonNegativeInt(raw.quantity);
    if (quantity === null || quantity < 1) {
      rowErrors.push(
        `quantity（数量）が「${raw.quantity ?? ""}」になっています。1 以上の整数にしてください。`,
      );
    }

    const amount = parseNonNegativeInt(raw.amount);
    if (amount === null) {
      rowErrors.push(
        `amount（金額）が「${raw.amount ?? ""}」になっています。0 以上の整数（円）にしてください。`,
      );
    }

    if (rowErrors.length > 0) {
      errors.push({ row: fileRow, message: rowErrors.join(" / ") });
      return;
    }

    normalized.push({
      orderId,
      orderDate: orderDate as string,
      customerId,
      customerEmail,
      productName,
      quantity: quantity as number,
      amount: amount as number,
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, rows: normalized };
}
