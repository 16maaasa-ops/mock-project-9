import Papa from "papaparse";
import { toYmd } from "@/lib/date";

/**
 * ファイル先頭の BOM（Excel の「CSV UTF-8」保存で付く見えない印）を除去する。
 * 除去しないと 1 列目の列名が "﻿order_id" と認識され、
 * 「order_id 列が見つかりません」という分かりにくいエラーになる。
 */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * 文字化けの簡易検知。Shift_JIS のファイルを UTF-8 として読むと、
 * 不正なバイト列が U+FFFD（置換文字）に変わる。これが含まれていれば
 * 文字コードが違う可能性が高いと判定する。
 */
export function looksMojibake(text: string): boolean {
  return text.includes("�");
}

/**
 * 日付を "YYYY-MM-DD" に正規化する。"2026-09-03" と "2026/9/3" の両方を受け付ける。
 * 実在しない日付（2 月 30 日など）は null。
 * タイムゾーンでずれないよう、Date の文字列パースは使わず数値として検証する。
 */
export function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();
  const match =
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed) ??
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(trimmed);
  if (!match) return null;
  return toYmd(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** CSV テキストをヘッダー付きでパースするだけの薄いラッパー。検証は validate.ts の役割。 */
export function parseCsvText(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });
  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
  };
}
