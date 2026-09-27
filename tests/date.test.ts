import { describe, expect, it } from "vitest";
import {
  addMonths,
  daysInMonth,
  isValidYmd,
  parseYmd,
  toYmd,
  todayJst,
} from "@/lib/date";

describe("toYmd / isValidYmd", () => {
  it("実在する日付を YYYY-MM-DD にする", () => {
    expect(toYmd(2026, 9, 3)).toBe("2026-09-03");
  });

  it("実在しない日付（2 月 30 日）は null", () => {
    expect(toYmd(2026, 2, 30)).toBeNull();
    expect(isValidYmd("2026-02-30")).toBe(false);
  });

  it("うるう年の 2 月 29 日は実在する／平年は実在しない", () => {
    expect(isValidYmd("2024-02-29")).toBe(true);
    expect(isValidYmd("2026-02-29")).toBe(false);
  });

  it("形式が違う文字列は不正", () => {
    expect(isValidYmd("2026/09/30")).toBe(false);
    expect(isValidYmd("2026-9-3")).toBe(false);
    expect(parseYmd("abc")).toBeNull();
  });

  it("0〜99 年のような極端な年は受け付けない（Date.UTC の癖の回避）", () => {
    expect(toYmd(50, 1, 1)).toBeNull();
  });

  it("月の日数を返す", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 9)).toBe(30);
  });
});

describe("addMonths", () => {
  it("基準日 2026-09-30 の 6 ヶ月前は 2026-03-30（README の判定基準）", () => {
    expect(addMonths("2026-09-30", -6)).toBe("2026-03-30");
  });

  it("月末は移動先の月末に丸める（8/31 の 6 ヶ月前は 2/28）", () => {
    expect(addMonths("2026-08-31", -6)).toBe("2026-02-28");
  });

  it("うるう年の 2 月末に丸める", () => {
    expect(addMonths("2024-08-31", -6)).toBe("2024-02-29");
  });

  it("月を足すときも月末に丸める", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("年をまたいで引く", () => {
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
    expect(addMonths("2026-01-15", -13)).toBe("2024-12-15");
  });

  it("年をまたいで足す", () => {
    expect(addMonths("2026-11-20", 3)).toBe("2027-02-20");
  });

  it("0 ヶ月ならそのまま", () => {
    expect(addMonths("2026-09-30", 0)).toBe("2026-09-30");
  });

  it("不正な日付は例外", () => {
    expect(() => addMonths("2026-02-30", 1)).toThrow(RangeError);
  });
});

describe("todayJst", () => {
  it("UTC の 15:00 は日本時間で翌日 0 時", () => {
    expect(todayJst(new Date("2026-09-30T14:59:59Z"))).toBe("2026-09-30");
    expect(todayJst(new Date("2026-09-30T15:00:00Z"))).toBe("2026-10-01");
  });

  it("UTC の前日夜でも、日本時間ではすでに翌日", () => {
    expect(todayJst(new Date("2026-09-29T15:30:00Z"))).toBe("2026-09-30");
  });
});
