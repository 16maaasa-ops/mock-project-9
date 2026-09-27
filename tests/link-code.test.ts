import { describe, expect, it } from "vitest";
import {
  LINK_CODE_ALPHABET,
  formatLinkCode,
  generateLinkCode,
  parseCodeInput,
} from "@/lib/link/code";

describe("generateLinkCode", () => {
  it("8 桁で、使えない文字（0 O 1 I）を含まない", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateLinkCode();
      expect(code).toHaveLength(8);
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    }
  });

  it("乱数源を差し替えると結果を固定できる（先頭の文字から順に選ぶ）", () => {
    let next = 0;
    const code = generateLinkCode(8, () => next++);
    expect(code).toBe(LINK_CODE_ALPHABET.slice(0, 8));
  });

  it("使う文字は 32 種類（読み間違えやすい文字を除いている）", () => {
    expect(LINK_CODE_ALPHABET).toHaveLength(32);
    for (const banned of ["0", "O", "1", "I"]) {
      expect(LINK_CODE_ALPHABET).not.toContain(banned);
    }
  });

  it("続けて作っても重複しない", () => {
    const codes = new Set(
      Array.from({ length: 2000 }, () => generateLinkCode()),
    );
    expect(codes.size).toBe(2000);
  });
});

describe("formatLinkCode", () => {
  it("4 桁ずつハイフンで区切る", () => {
    expect(formatLinkCode("ABCDEFGH")).toBe("ABCD-EFGH");
  });
});

describe("parseCodeInput", () => {
  it("そのままの形を受け付ける", () => {
    expect(parseCodeInput("ABCDEFGH")).toEqual({
      kind: "valid",
      code: "ABCDEFGH",
    });
  });

  it("小文字・空白・ハイフンがあっても受け付ける", () => {
    expect(parseCodeInput("abcd efgh")).toEqual({
      kind: "valid",
      code: "ABCDEFGH",
    });
    expect(parseCodeInput("abcd-efgh")).toEqual({
      kind: "valid",
      code: "ABCDEFGH",
    });
    expect(parseCodeInput("  ABCD‐EFGH \n")).toEqual({
      kind: "valid",
      code: "ABCDEFGH",
    });
  });

  it("全角で入力されても受け付ける", () => {
    expect(parseCodeInput("ＡＢＣＤ－ＥＦＧＨ")).toEqual({
      kind: "valid",
      code: "ABCDEFGH",
    });
    expect(parseCodeInput("ＫＭ２３－ＮＰ９９")).toEqual({
      kind: "valid",
      code: "KM23NP99",
    });
  });

  it("使えない文字（0 O 1 I）を含む 8 桁は、形式の誤りとして扱う", () => {
    expect(parseCodeInput("ABCD-EFG0")).toEqual({ kind: "invalid_format" });
    expect(parseCodeInput("IIIIIIII")).toEqual({ kind: "invalid_format" });
  });

  it("桁数が違うコードらしい入力は、形式の誤りとして扱う", () => {
    expect(parseCodeInput("ABCDEFG")).toEqual({ kind: "invalid_format" });
    expect(parseCodeInput("ABCDEFGHJK")).toEqual({ kind: "invalid_format" });
  });

  it("日本語の文章や短い返事は、コード入力ではないと扱う", () => {
    expect(parseCodeInput("こんにちは")).toEqual({ kind: "not_code" });
    expect(parseCodeInput("OK")).toEqual({ kind: "not_code" });
    expect(parseCodeInput("1234")).toEqual({ kind: "not_code" });
    expect(parseCodeInput("hello world how are you")).toEqual({
      kind: "not_code",
    });
    expect(parseCodeInput("")).toEqual({ kind: "not_code" });
  });
});
