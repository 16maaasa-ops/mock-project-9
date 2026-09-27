"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/auth/dal";
import { MAX_CSV_BYTES } from "@/lib/config";
import type { CsvValidationError, OrderRow } from "@/lib/csv/types";
import { validateAndNormalizeCsv } from "@/lib/csv/validate";
import { todayJst } from "@/lib/date";
import { diffSegments } from "@/lib/segment/classify";
import { computeEffectiveSegments } from "@/lib/segment/recompute";
import type { Segment, SegmentChange } from "@/lib/segment/types";
import { fetchCustomerSegments } from "@/lib/customers/read";
import { getSegmentSettings } from "@/lib/settings/read";
import { createServiceClient } from "@/lib/supabase/service";
import { previewImport, type ImportPreview } from "./preview";
import { fetchExistingCustomerEmails, fetchExistingOrdersById } from "./read";

type ValidationFailure = {
  ok: false;
  kind: "validation";
  errors: CsvValidationError[];
};
type PreviewSuccess = { ok: true; totalRows: number; preview: ImportPreview };
type PreviewFailure = {
  ok: false;
  kind: "size" | "validation";
  message?: string;
  errors?: CsvValidationError[];
};

function checkSize(rawText: string): string | null {
  const bytes = new TextEncoder().encode(rawText).length;
  if (bytes > MAX_CSV_BYTES) {
    return `ファイルサイズが大きすぎます（${Math.ceil(bytes / 1024)}KB）。${Math.floor(
      MAX_CSV_BYTES / 1024,
    )}KB以内にしてください。`;
  }
  return null;
}

async function parseAndValidate(
  rawText: string,
): Promise<{ ok: true; rows: OrderRow[] } | ValidationFailure> {
  const settings = await getSegmentSettings();
  const referenceDate = settings.referenceDate ?? todayJst();
  const result = validateAndNormalizeCsv(rawText, { referenceDate });
  if (!result.ok) {
    return { ok: false, kind: "validation", errors: result.errors };
  }
  return { ok: true, rows: result.rows };
}

/** アップロードされたCSVを検証し、取り込み前の内容（新規・重複・内容相違）を確認する。DBへの書き込みはしない。 */
export async function previewImportCsv(
  rawText: string,
): Promise<PreviewSuccess | PreviewFailure> {
  await verifySession();

  const sizeError = checkSize(rawText);
  if (sizeError) return { ok: false, kind: "size", message: sizeError };

  const parsed = await parseAndValidate(rawText);
  if (!parsed.ok) return parsed;

  const [existingOrders, existingCustomers] = await Promise.all([
    fetchExistingOrdersById(),
    fetchExistingCustomerEmails(),
  ]);

  const preview = previewImport({
    existingOrders,
    existingCustomers,
    rows: parsed.rows,
  });

  return { ok: true, totalRows: parsed.rows.length, preview };
}

export type CommitImportResult =
  | {
      ok: true;
      newOrderCount: number;
      duplicateCount: number;
      conflictOrderIds: string[];
      newCustomerCount: number;
      changedSegments: SegmentChange[];
    }
  | {
      ok: false;
      kind: "size" | "validation" | "customer_conflict" | "db";
      message: string;
      errors?: CsvValidationError[];
    };

/** CSVを実際に取り込む。顧客の食い違いが1件でもあれば全体を中止する。 */
export async function commitImportCsv(
  rawText: string,
  filename: string,
): Promise<CommitImportResult> {
  await verifySession();
  const supabase = createServiceClient();

  const sizeError = checkSize(rawText);
  if (sizeError) return { ok: false, kind: "size", message: sizeError };

  const parsed = await parseAndValidate(rawText);
  if (!parsed.ok) {
    return {
      ok: false,
      kind: "validation",
      message: "CSVの内容にエラーがあります。",
      errors: parsed.errors,
    };
  }
  const rows = parsed.rows;

  const { data: job, error: jobError } = await supabase
    .from("import_jobs")
    .insert({ filename, status: "running", total_rows: rows.length })
    .select("id")
    .single();
  if (jobError || !job) {
    return {
      ok: false,
      kind: "db",
      message: "取り込み履歴の作成に失敗しました。",
    };
  }

  const rpcRows = rows.map((r) => ({
    order_id: r.orderId,
    order_date: r.orderDate,
    customer_id: r.customerId,
    customer_email: r.customerEmail,
    product_name: r.productName,
    quantity: r.quantity,
    amount: r.amount,
  }));

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "import_orders",
    {
      rows_in: rpcRows,
    },
  );

  if (rpcError) {
    const isCustomerConflict = rpcError.message?.includes("customer_conflict");
    const message = isCustomerConflict
      ? "顧客IDとメールアドレスの対応が、登録済みのデータと食い違っています。CSVの内容を確認してください。"
      : `取り込みに失敗しました（${rpcError.message}）。`;
    await supabase
      .from("import_jobs")
      .update({
        status: "failed",
        error_message: message,
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return {
      ok: false,
      kind: isCustomerConflict ? "customer_conflict" : "db",
      message,
    };
  }

  const result = rpcResult as {
    new_order_count: number;
    duplicate_count: number;
    conflict_order_ids: string[];
    new_customer_ids: string[];
  };

  // セグメントを再計算し、変わった顧客だけ書き戻す
  const settings = await getSegmentSettings();
  const referenceDate = settings.referenceDate ?? todayJst();
  const [beforeRaw, after] = await Promise.all([
    fetchCustomerSegments(),
    computeEffectiveSegments(
      {
        vipThreshold: settings.vipThreshold,
        repeatMonths: settings.repeatMonths,
      },
      referenceDate,
    ),
  ]);
  // 未判定（null）は「まだ判定されていない」= diffSegments 側の from:null と同じ扱いにする
  const before = new Map(
    [...beforeRaw].filter(
      (entry): entry is [string, Segment] => entry[1] !== null,
    ),
  );
  const changes = diffSegments(before, after);

  await Promise.all(
    changes.map((change) =>
      supabase
        .from("customers")
        .update({ segment: after.get(change.customerId) })
        .eq("customer_id", change.customerId),
    ),
  );

  const segmentCounts: Record<string, number> = {};
  for (const segment of after.values()) {
    segmentCounts[segment] = (segmentCounts[segment] ?? 0) + 1;
  }

  await supabase
    .from("import_jobs")
    .update({
      status: "success",
      new_order_count: result.new_order_count,
      duplicate_count: result.duplicate_count,
      conflict_order_ids: result.conflict_order_ids,
      new_customer_ids: result.new_customer_ids,
      segment_counts: segmentCounts,
      changed_customer_count: changes.length,
      finished_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  revalidatePath("/admin");
  revalidatePath("/admin/import");
  revalidatePath("/admin/customers");

  return {
    ok: true,
    newOrderCount: result.new_order_count,
    duplicateCount: result.duplicate_count,
    conflictOrderIds: result.conflict_order_ids,
    newCustomerCount: result.new_customer_ids?.length ?? 0,
    changedSegments: changes,
  };
}

export type ImportJobRow = {
  id: string;
  filename: string;
  status: string;
  totalRows: number | null;
  newOrderCount: number | null;
  duplicateCount: number | null;
  conflictOrderIds: string[] | null;
  changedCustomerCount: number | null;
  errorMessage: string | null;
  createdAt: string;
};

export async function fetchRecentImportJobs(
  limit = 10,
): Promise<ImportJobRow[]> {
  await verifySession();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("import_jobs")
    .select(
      "id, filename, status, total_rows, new_order_count, duplicate_count, conflict_order_ids, changed_customer_count, error_message, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    filename: row.filename,
    status: row.status,
    totalRows: row.total_rows,
    newOrderCount: row.new_order_count,
    duplicateCount: row.duplicate_count,
    conflictOrderIds: row.conflict_order_ids,
    changedCustomerCount: row.changed_customer_count,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  }));
}
