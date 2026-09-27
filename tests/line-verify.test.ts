import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isValidLineSignature } from "@/lib/line/verify";

const SECRET = "test-channel-secret";
const BODY = JSON.stringify({ destination: "U0", events: [] });

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64");
}

describe("isValidLineSignature", () => {
  it("正しい署名なら true", () => {
    expect(isValidLineSignature(BODY, SECRET, sign(BODY, SECRET))).toBe(true);
  });

  it("本文が 1 文字でも書き換えられていたら false", () => {
    expect(isValidLineSignature(`${BODY} `, SECRET, sign(BODY, SECRET))).toBe(
      false,
    );
  });

  it("別のシークレットで作られた署名なら false", () => {
    expect(isValidLineSignature(BODY, SECRET, sign(BODY, "other-secret"))).toBe(
      false,
    );
  });

  it("署名ヘッダーが無い・空なら false", () => {
    expect(isValidLineSignature(BODY, SECRET, null)).toBe(false);
    expect(isValidLineSignature(BODY, SECRET, "")).toBe(false);
  });

  it("長さの違う不正な署名でも例外にならず false", () => {
    expect(isValidLineSignature(BODY, SECRET, "abc")).toBe(false);
  });
});
