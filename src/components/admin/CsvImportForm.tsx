"use client";

import { useRef, useState, useTransition } from "react";
import {
  commitImportCsv,
  previewImportCsv,
  type CommitImportResult,
} from "@/lib/import/actions";
import type { CsvValidationError } from "@/lib/csv/types";
import type { ImportPreview } from "@/lib/import/preview";
import { SEGMENT_LABELS } from "@/lib/segment/types";

type Loaded = { filename: string; rawText: string };

export function CsvImportForm() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [errors, setErrors] = useState<CsvValidationError[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<CommitImportResult | null>(null);
  const [isPreviewing, startPreview] = useTransition();
  const [isCommitting, startCommit] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setErrors(null);
    setMessage(null);
    setPreview(null);
    setResult(null);
  }

  async function handleFile(file: File) {
    reset();
    const rawText = await file.text();
    setLoaded({ filename: file.name, rawText });

    startPreview(async () => {
      const res = await previewImportCsv(rawText);
      if (!res.ok) {
        if (res.kind === "validation") setErrors(res.errors ?? null);
        else setMessage(res.message ?? "確認に失敗しました。");
        return;
      }
      setPreview(res.preview);
    });
  }

  function handleCommit() {
    if (!loaded) return;
    startCommit(async () => {
      const res = await commitImportCsv(loaded.rawText, loaded.filename);
      setResult(res);
      if (res.ok) {
        setLoaded(null);
        setPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        className="rounded-xl border-2 border-dashed border-brand-border bg-white p-6 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
      >
        <p className="text-sm text-brand-espresso-soft">
          注文CSVをここにドラッグ&amp;ドロップ、または選択してください
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="mt-3"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>

      {isPreviewing && (
        <p className="text-sm text-brand-espresso-soft">確認しています…</p>
      )}

      {errors && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4">
          <p className="font-semibold text-red-800">
            CSVにエラーがあります（{errors.length}
            件）。修正してから、もう一度お試しください。
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-red-800">
            {errors.slice(0, 20).map((e, i) => (
              <li key={i}>
                {e.row > 0 ? `${e.row}行目：` : ""}
                {e.message}
              </li>
            ))}
          </ul>
          {errors.length > 20 && (
            <p className="mt-1 text-sm text-red-800">
              他 {errors.length - 20} 件…
            </p>
          )}
        </div>
      )}

      {message && <p className="text-sm text-red-700">{message}</p>}

      {preview && loaded && (
        <div className="rounded-xl border border-brand-border bg-white p-4">
          <h2 className="font-semibold">取り込み前の確認：{loaded.filename}</h2>
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            <li>ファイルの行数：{preview.totalRows}行</li>
            <li>新しく取り込む注文：{preview.newOrders.length}件</li>
            <li>
              すでに取り込み済み（重複・スキップ）：{preview.duplicateCount}件
            </li>
            <li>新しい顧客：{preview.newCustomerIds.length}人</li>
            {preview.conflictOrderIds.length > 0 && (
              <li className="text-amber-800">
                同じ注文番号なのに内容が違う行（上書きせずスキップします）：
                {preview.conflictOrderIds.join("、")}
              </li>
            )}
          </ul>

          {!preview.canImport ? (
            <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              顧客IDとメールアドレスの対応が、登録済みのデータと食い違っている行があるため、
              取り込めません。
              <ul className="mt-1 list-disc pl-5">
                {preview.customerConflicts.map((c) => (
                  <li key={c.customerId}>
                    {c.customerId}：
                    {c.reason === "email_mismatch"
                      ? "登録済みのメールアドレスと異なります"
                      : "そのメールアドレスは別の顧客IDで登録済みです"}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleCommit}
              disabled={isCommitting}
              className="mt-4 rounded-lg bg-brand-espresso px-4 py-2 text-sm font-medium text-brand-cream disabled:opacity-60"
            >
              {isCommitting ? "取り込んでいます…" : "この内容で取り込む"}
            </button>
          )}
        </div>
      )}

      {result && (
        <div
          className={`rounded-xl border p-4 ${
            result.ok
              ? "border-green-300 bg-green-50"
              : "border-red-300 bg-red-50"
          }`}
        >
          {result.ok ? (
            <>
              <p className="font-semibold text-green-800">
                取り込みが完了しました。
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-green-900">
                <li>新しく取り込んだ注文：{result.newOrderCount}件</li>
                <li>スキップした重複：{result.duplicateCount}件</li>
                <li>新しい顧客：{result.newCustomerCount}人</li>
                <li>
                  セグメントが変わった顧客：{result.changedSegments.length}人
                  {result.changedSegments.length > 0 && (
                    <ul className="mt-1 list-disc pl-5">
                      {result.changedSegments.map((c) => (
                        <li key={c.customerId}>
                          {c.customerId}：
                          {c.from ? SEGMENT_LABELS[c.from] : "（未判定）"}
                          {" → "}
                          {SEGMENT_LABELS[c.to]}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              </ul>
            </>
          ) : (
            <p className="text-red-800">{result.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
