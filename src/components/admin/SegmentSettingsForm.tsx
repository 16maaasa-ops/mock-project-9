"use client";

import { useState, useTransition } from "react";
import {
  previewSegmentSettingsChange,
  updateSegmentSettings,
  type SettingsInput,
} from "@/lib/settings/actions";
import { SEGMENT_LABELS } from "@/lib/segment/types";
import type { SegmentChange } from "@/lib/segment/types";

export function SegmentSettingsForm({
  initial,
}: {
  initial: {
    vipThreshold: number;
    repeatMonths: number;
    referenceDate: string | null;
  };
}) {
  const [vipThreshold, setVipThreshold] = useState(
    String(initial.vipThreshold),
  );
  const [repeatMonths, setRepeatMonths] = useState(
    String(initial.repeatMonths),
  );
  const [fixReferenceDate, setFixReferenceDate] = useState(
    initial.referenceDate !== null,
  );
  const [referenceDate, setReferenceDate] = useState(
    initial.referenceDate ?? "",
  );

  const [preview, setPreview] = useState<SegmentChange[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewing, startPreview] = useTransition();
  const [isSaving, startSave] = useTransition();

  function currentInput(): SettingsInput {
    return {
      vipThreshold: Number(vipThreshold),
      repeatMonths: Number(repeatMonths),
      referenceDate: fixReferenceDate ? referenceDate : null,
    };
  }

  function handlePreview() {
    setError(null);
    setMessage(null);
    startPreview(async () => {
      const result = await previewSegmentSettingsChange(currentInput());
      if (!result.ok) {
        setError(result.error);
        setPreview(null);
        return;
      }
      setPreview(result.changes);
    });
  }

  function handleSave() {
    setError(null);
    startSave(async () => {
      const result = await updateSegmentSettings(currentInput());
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(
        `保存しました。${result.changedCount}人のセグメントを再計算しました。`,
      );
      setPreview(null);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-brand-border bg-white p-4">
        <h2 className="font-semibold">判定条件</h2>

        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            VIPの閾値（累計購入額・円）
            <input
              type="number"
              min={1}
              value={vipThreshold}
              onChange={(e) => setVipThreshold(e.target.value)}
              className="w-40 rounded-lg border border-brand-border px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            リピーターとみなす期間（ヶ月）
            <input
              type="number"
              min={1}
              value={repeatMonths}
              onChange={(e) => setRepeatMonths(e.target.value)}
              className="w-40 rounded-lg border border-brand-border px-3 py-2"
            />
          </label>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={fixReferenceDate}
              onChange={(e) => setFixReferenceDate(e.target.checked)}
            />
            基準日を固定する（デモ・確認用。本番運用では外してください）
          </label>

          {fixReferenceDate && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              固定する基準日
              <input
                type="date"
                value={referenceDate}
                onChange={(e) => setReferenceDate(e.target.value)}
                className="w-48 rounded-lg border border-brand-border px-3 py-2"
              />
            </label>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {message && <p className="mt-3 text-sm text-green-700">{message}</p>}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handlePreview}
            disabled={isPreviewing || isSaving}
            className="rounded-lg border border-brand-border px-4 py-2 text-sm font-medium hover:bg-brand-cream disabled:opacity-60"
          >
            {isPreviewing ? "計算しています…" : "変更の影響を確認する"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isPreviewing}
            className="rounded-lg bg-brand-espresso px-4 py-2 text-sm font-medium text-brand-cream disabled:opacity-60"
          >
            {isSaving ? "保存しています…" : "保存する"}
          </button>
        </div>
      </div>

      {preview && (
        <div className="rounded-xl border border-brand-border bg-white p-4">
          <h2 className="font-semibold">
            この設定で保存すると、{preview.length}人のセグメントが変わります
          </h2>
          {preview.length === 0 ? (
            <p className="mt-2 text-sm text-brand-espresso-soft">
              変化はありません。
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              {preview.map((change) => (
                <li key={change.customerId}>
                  {change.customerId}：
                  {change.from ? SEGMENT_LABELS[change.from] : "（未判定）"} →{" "}
                  <strong>{SEGMENT_LABELS[change.to]}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
