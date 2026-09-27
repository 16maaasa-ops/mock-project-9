"use client";

import { useState, useTransition } from "react";
import {
  fetchCustomerDetail,
  issueLinkCode,
  setSegmentOverride,
  type CustomerDetail,
} from "@/lib/customers/actions";
import { formatLinkCode } from "@/lib/link/code";
import { formatYen } from "@/lib/format";
import { maskEmail } from "@/lib/customers/mask";
import { SEGMENTS, SEGMENT_LABELS, type Segment } from "@/lib/segment/types";
import type { CustomerListRow } from "@/lib/customers/read";

function guidanceText(customerId: string, code: string): string {
  return [
    "いつもご利用ありがとうございます。",
    "LINE公式アカウントとお客様の情報を連携すると、",
    "ご利用状況に合わせたメニューが表示されるようになります。",
    "",
    `お客様専用のコードです： ${formatLinkCode(code)}`,
    "",
    "上記のコードを、そのままこのトークにお送りください（大文字・小文字は区別しません）。",
  ].join("\n");
}

export function CustomerRow({ row }: { row: CustomerListRow }) {
  const [revealed, setRevealed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [issued, setIssued] = useState<{
    code: string;
    expiresAt: string;
  } | null>(row.unusedCode);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const effectiveSegment = row.segmentOverride ?? row.segment;

  function toggleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && !detail) {
      startTransition(async () => {
        const d = await fetchCustomerDetail(row.customerId);
        setDetail(d);
      });
    }
  }

  function handleIssueCode() {
    setMessage(null);
    startTransition(async () => {
      const res = await issueLinkCode(row.customerId);
      if (res.ok) {
        setIssued({ code: res.code, expiresAt: res.expiresAt });
        setMessage("コードを発行しました。");
      } else {
        setMessage(res.message);
      }
    });
  }

  async function handleCopyGuidance() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(
        guidanceText(row.customerId, issued.code),
      );
      setMessage("案内文をコピーしました。");
    } catch {
      setMessage(
        "コピーできませんでした。お使いのブラウザの設定をご確認ください。",
      );
    }
  }

  function handleOverrideChange(value: string) {
    const segment = value === "" ? null : (value as Segment);
    startTransition(async () => {
      await setSegmentOverride(row.customerId, segment);
    });
  }

  return (
    <>
      <tr className="border-b border-brand-border last:border-0">
        <td className="px-3 py-2 align-top">{row.customerId}</td>
        <td className="px-3 py-2 align-top">
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="underline decoration-dotted"
            title="タップして表示・非表示を切り替え"
          >
            {revealed ? row.email : maskEmail(row.email)}
          </button>
        </td>
        <td className="px-3 py-2 align-top">
          <div className="flex flex-col gap-1">
            <span>
              {effectiveSegment ? SEGMENT_LABELS[effectiveSegment] : "未判定"}
              {row.segmentOverride && (
                <span className="ml-1 rounded bg-amber-200 px-1.5 py-0.5 text-xs text-amber-900">
                  手動指定中
                </span>
              )}
            </span>
            <select
              value={row.segmentOverride ?? ""}
              onChange={(e) => handleOverrideChange(e.target.value)}
              disabled={isPending}
              className="w-32 rounded border border-brand-border px-1 py-0.5 text-xs"
            >
              <option value="">自動判定を使う</option>
              {SEGMENTS.map((s) => (
                <option key={s} value={s}>
                  {SEGMENT_LABELS[s]}に固定
                </option>
              ))}
            </select>
          </div>
        </td>
        <td className="px-3 py-2 align-top whitespace-nowrap">
          {row.orderCount}件 / {formatYen(row.totalAmount)}
        </td>
        <td className="px-3 py-2 align-top">
          {row.lineUserId ? (
            <span className="text-green-700">連携済み</span>
          ) : (
            <span className="text-brand-espresso-soft">未連携</span>
          )}
        </td>
        <td className="px-3 py-2 align-top">
          <div className="flex flex-col gap-1">
            {issued ? (
              <>
                <code className="rounded bg-brand-cream px-1.5 py-0.5 text-xs">
                  {formatLinkCode(issued.code)}
                </code>
                <button
                  type="button"
                  onClick={handleCopyGuidance}
                  className="text-left text-xs text-brand-caramel underline"
                >
                  案内文をコピー
                </button>
              </>
            ) : (
              <span className="text-xs text-brand-espresso-soft">未発行</span>
            )}
            <button
              type="button"
              onClick={handleIssueCode}
              disabled={isPending}
              className="rounded border border-brand-border px-2 py-1 text-xs hover:bg-brand-cream disabled:opacity-60"
            >
              {issued ? "再発行" : "発行する"}
            </button>
          </div>
        </td>
        <td className="px-3 py-2 align-top">
          <button
            type="button"
            onClick={toggleExpand}
            className="text-xs text-brand-caramel underline"
          >
            {expanded ? "閉じる" : "詳細"}
          </button>
        </td>
      </tr>

      {message && (
        <tr>
          <td
            colSpan={7}
            className="px-3 pb-2 text-xs text-brand-espresso-soft"
          >
            {message}
          </td>
        </tr>
      )}

      {expanded && (
        <tr>
          <td colSpan={7} className="bg-brand-cream px-3 py-3">
            {!detail ? (
              <p className="text-sm text-brand-espresso-soft">
                読み込んでいます…
              </p>
            ) : (
              <div className="flex flex-col gap-2 text-sm">
                <p>
                  <strong>判定理由：</strong>
                  {detail.reason}
                </p>
                {detail.orders.length === 0 ? (
                  <p className="text-brand-espresso-soft">
                    注文履歴はありません。
                  </p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="text-brand-espresso-soft">
                      <tr>
                        <th className="py-1 pr-2">注文日</th>
                        <th className="py-1 pr-2">商品</th>
                        <th className="py-1 pr-2">数量</th>
                        <th className="py-1 pr-2">金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.orders.map((o) => (
                        <tr key={o.orderId}>
                          <td className="py-1 pr-2 whitespace-nowrap">
                            {o.orderDate}
                          </td>
                          <td className="py-1 pr-2">{o.productName}</td>
                          <td className="py-1 pr-2">{o.quantity}</td>
                          <td className="py-1 pr-2 whitespace-nowrap">
                            {formatYen(o.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
