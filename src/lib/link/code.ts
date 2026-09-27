import { randomInt } from "node:crypto";
import { LINK_CODE_LENGTH } from "@/lib/config";

/**
 * 紐付けコードに使う文字。読み間違えやすい 0 / O / 1 / I を除いた 32 文字。
 * 8 桁なら 32^8（約 1 兆通り）で、当てずっぽうでは他人のコードに当たらない。
 */
export const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * 紐付けコードを作る。推測されにくくするため Math.random は使わず、
 * 暗号用の乱数（crypto.randomInt）を使う。テストで固定できるよう乱数源は差し替え可能。
 */
export function generateLinkCode(
  length: number = LINK_CODE_LENGTH,
  pickIndex: (max: number) => number = (max) => randomInt(max),
): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += LINK_CODE_ALPHABET[pickIndex(LINK_CODE_ALPHABET.length)];
  }
  return code;
}

/** 表示用に "ABCD-EFGH" の形にする。 */
export function formatLinkCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export type CodeInput =
  /** コードとして受け付けられる形 */
  | { kind: "valid"; code: string }
  /** コードのつもりで入力したようだが、形式が違う（桁数・使えない文字など） */
  | { kind: "invalid_format" }
  /** 普通の会話文などで、コード入力ではなさそう */
  | { kind: "not_code" };

// ハイフン・ダッシュ・長音記号・マイナスなど、区切りとして入力されがちな文字
const SEPARATORS = /[\s\-‐-―−ー－]/g;

/**
 * LINE で届いた文字列をコード入力として解釈する。
 * 全角→半角、大文字小文字、空白・ハイフンの有無は区別せず受け付ける。
 */
export function parseCodeInput(raw: string): CodeInput {
  const cleaned = raw.normalize("NFKC").toUpperCase().replace(SEPARATORS, "");

  // 日本語の文章など、英数字以外が混じるものはコード入力とみなさない
  if (!/^[A-Z0-9]+$/.test(cleaned)) return { kind: "not_code" };
  if (cleaned.length < 6 || cleaned.length > 12) return { kind: "not_code" };

  const isValid =
    cleaned.length === LINK_CODE_LENGTH &&
    [...cleaned].every((char) => LINK_CODE_ALPHABET.includes(char));

  return isValid
    ? { kind: "valid", code: cleaned }
    : { kind: "invalid_format" };
}
