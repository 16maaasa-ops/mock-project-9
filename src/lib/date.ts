/**
 * カレンダー上の日付を "YYYY-MM-DD" の文字列で扱うための関数群。
 *
 * new Date("2026-09-30") のような文字列パースや、new Date(年, 月, 日) は
 * 実行環境のタイムゾーンによって日付がずれることがある。
 * そのためここでは、すべて UTC（世界標準時）の数値計算だけで日付を扱う。
 * 文字列のまま比較しても、"YYYY-MM-DD" なら日付の前後関係が正しく判定できる。
 */

const YMD_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 指定した年月（月は 1〜12）の日数。 */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * 年・月・日から "YYYY-MM-DD" を作る。実在しない日付（2 月 30 日など）は null。
 * Date.UTC は 0〜99 年を 1900 年代と解釈する癖があるため、年は 1000〜9999 に限定する。
 */
export function toYmd(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** "YYYY-MM-DD" を年・月・日に分解する。形式が違う・実在しない日付なら null。 */
export function parseYmd(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = YMD_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return toYmd(year, month, day) === null ? null : { year, month, day };
}

export function isValidYmd(value: string): boolean {
  return parseYmd(value) !== null;
}

/**
 * 月数を足す（引く場合は負の数）。移動先の月に同じ日が無い場合は月末に丸める。
 * 例: 2026-08-31 の 6 ヶ月前は 2026-02-28、2026-09-30 の 6 ヶ月前は 2026-03-30。
 */
export function addMonths(value: string, months: number): string {
  const parsed = parseYmd(value);
  if (!parsed) throw new RangeError(`日付の形式が正しくありません: ${value}`);

  const totalMonths = parsed.year * 12 + (parsed.month - 1) + months;
  const year = Math.floor(totalMonths / 12);
  const month = (((totalMonths % 12) + 12) % 12) + 1;
  const day = Math.min(parsed.day, daysInMonth(year, month));

  const result = toYmd(year, month, day);
  if (result === null) throw new RangeError(`計算結果が範囲外です: ${value}`);
  return result;
}

/** 日本時間（JST）での「今日」を "YYYY-MM-DD" で返す。日本は夏時間が無いので +9 時間でよい。 */
export function todayJst(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}
