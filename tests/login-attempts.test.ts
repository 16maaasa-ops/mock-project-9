import { describe, expect, it } from "vitest";
import { getClientIp, isLocked } from "@/lib/auth/login-attempts-pure";

describe("isLocked", () => {
  const now = new Date("2026-09-30T12:00:00Z");

  it("ロック日時が無ければロックされていない", () => {
    expect(isLocked({ lockedUntil: null }, now)).toBe(false);
  });

  it("ロック日時が未来ならロック中", () => {
    expect(isLocked({ lockedUntil: "2026-09-30T12:05:00Z" }, now)).toBe(true);
  });

  it("ロック日時が過去ならロックは解けている", () => {
    expect(isLocked({ lockedUntil: "2026-09-30T11:55:00Z" }, now)).toBe(false);
  });

  it("ロック日時がちょうど今なら、ロックは解けている扱い", () => {
    expect(isLocked({ lockedUntil: "2026-09-30T12:00:00Z" }, now)).toBe(false);
  });
});

describe("getClientIp", () => {
  it("x-forwarded-for の先頭（実際の接続元）を使う", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("203.0.113.1");
  });

  it("前後の空白を取り除く", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "  203.0.113.1  ,10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("203.0.113.1");
  });

  it("ヘッダーが無ければ unknown", () => {
    const req = new Request("https://example.com");
    expect(getClientIp(req)).toBe("unknown");
  });
});
