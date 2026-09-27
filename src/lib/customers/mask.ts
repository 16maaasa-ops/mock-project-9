/**
 * メールアドレスを一覧表示用にマスクする（個人情報のため、既定では隠す）。
 * "customer001@example.com" → "cu******@example.com"
 */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = local.slice(0, Math.min(2, local.length));
  const hidden = "*".repeat(Math.max(local.length - visible.length, 3));
  return `${visible}${hidden}${domain}`;
}
