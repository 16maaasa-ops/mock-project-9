export function ReferenceDateBanner({
  referenceDate,
}: {
  referenceDate: string | null;
}) {
  if (!referenceDate) return null;

  return (
    <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
      基準日を <strong>{referenceDate}</strong>{" "}
      に固定しています（デモ・確認用）。
      本番運用に切り替えるときは、設定画面で固定を解除してください。
    </div>
  );
}
