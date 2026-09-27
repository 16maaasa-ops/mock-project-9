export type ChecklistItem = {
  key: string;
  label: string;
  done: boolean;
  href: string;
};

/**
 * ダッシュボードの「はじめに」チェックリスト。純粋関数にして、
 * 「何が終わっていれば完了扱いにするか」をテストで固定できるようにしてある。
 */
export function buildInitialChecklist(input: {
  lineConnected: boolean;
  richMenuSlotsRegistered: number; // 0〜5
  ordersImported: boolean;
  codesIssued: boolean;
}): ChecklistItem[] {
  return [
    {
      key: "line",
      label: "① LINE公式アカウントを接続する",
      done: input.lineConnected,
      href: "/admin/settings",
    },
    {
      key: "menus",
      label: `② リッチメニュー画像を登録する（${input.richMenuSlotsRegistered}/5枠）`,
      done: input.richMenuSlotsRegistered >= 5,
      href: "/admin/richmenus",
    },
    {
      key: "orders",
      label: "③ 注文CSVを取り込む",
      done: input.ordersImported,
      href: "/admin/import",
    },
    {
      key: "codes",
      label: "④ 顧客にコードを配布する",
      done: input.codesIssued,
      href: "/admin/customers",
    },
  ];
}
