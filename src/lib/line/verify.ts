import { validateSignature } from "@line/bot-sdk";

/**
 * LINE からの Webhook が本物かを、署名で検証する。
 * rawBody は「JSON に変換する前の、届いたままの文字列」でなければならない
 * （変換後に再び文字列にすると空白などが変わり、署名が一致しなくなる）。
 */
export function isValidLineSignature(
  rawBody: string,
  channelSecret: string,
  signature: string | null,
): boolean {
  if (!signature) return false;
  try {
    return validateSignature(rawBody, channelSecret, signature);
  } catch {
    return false;
  }
}
