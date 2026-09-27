"use client";

import { useMemo, useState } from "react";
import { CustomerRow } from "./CustomerRow";
import { SEGMENTS, SEGMENT_LABELS } from "@/lib/segment/types";
import type { CustomerListRow } from "@/lib/customers/read";

type LinkFilter = "all" | "linked" | "not_linked";

export function CustomerTable({ rows }: { rows: CustomerListRow[] }) {
  const [search, setSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<string>("all");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (
        q &&
        !row.customerId.toLowerCase().includes(q) &&
        !row.email.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (segmentFilter !== "all") {
        const effective = row.segmentOverride ?? row.segment;
        if (effective !== segmentFilter) return false;
      }
      if (linkFilter === "linked" && !row.lineUserId) return false;
      if (linkFilter === "not_linked" && row.lineUserId) return false;
      return true;
    });
  }, [rows, search, segmentFilter, linkFilter]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="顧客ID・メールアドレスで検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 rounded-lg border border-brand-border px-3 py-2 text-sm"
        />
        <select
          value={segmentFilter}
          onChange={(e) => setSegmentFilter(e.target.value)}
          className="rounded-lg border border-brand-border px-3 py-2 text-sm"
        >
          <option value="all">すべてのセグメント</option>
          {SEGMENTS.map((s) => (
            <option key={s} value={s}>
              {SEGMENT_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={linkFilter}
          onChange={(e) => setLinkFilter(e.target.value as LinkFilter)}
          className="rounded-lg border border-brand-border px-3 py-2 text-sm"
        >
          <option value="all">連携状況すべて</option>
          <option value="linked">連携済みのみ</option>
          <option value="not_linked">未連携のみ</option>
        </select>
      </div>

      <p className="text-sm text-brand-espresso-soft">
        {filtered.length}人 / 全{rows.length}人
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-brand-border bg-white p-4 text-sm text-brand-espresso-soft">
          条件に一致する顧客がいません。
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-brand-border bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-brand-border text-brand-espresso-soft">
              <tr>
                <th className="px-3 py-2">顧客ID</th>
                <th className="px-3 py-2">メールアドレス</th>
                <th className="px-3 py-2">セグメント</th>
                <th className="px-3 py-2">購入</th>
                <th className="px-3 py-2">LINE連携</th>
                <th className="px-3 py-2">紐付けコード</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <CustomerRow key={row.customerId} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
