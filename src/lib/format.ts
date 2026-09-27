/** 金額を「¥30,000」の形式にする。ICU（地域設定データ）に依存しないよう手で桁区切りする。 */
export function formatYen(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  const digits = String(Math.abs(rounded)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
  return `${sign}¥${digits}`;
}
