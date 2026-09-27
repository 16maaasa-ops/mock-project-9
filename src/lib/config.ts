/** CSV に必須の 7 列。README の「CSV の列」と 1 対 1 で一致させる。 */
export const REQUIRED_CSV_COLUMNS = [
  "order_id",
  "order_date",
  "customer_id",
  "customer_email",
  "product_name",
  "quantity",
  "amount",
] as const;

/** アップロードできる CSV の最大サイズ（バイト）。 */
export const MAX_CSV_BYTES = 2 * 1024 * 1024;

/** 1 ファイルの最大行数。数十〜百人規模の模擬案件なので十分に余裕を持たせた値。 */
export const MAX_CSV_ROWS = 5000;

/** セグメント判定の初期値（管理画面で運用者が変更できる）。 */
export const DEFAULT_SEGMENT_SETTINGS = {
  vipThreshold: 30000,
  repeatMonths: 6,
} as const;

/**
 * デモ・正解値確認用の基準日。README の正解値はこの日付で判定した結果。
 * 本番運用に切り替えるときは設定画面で解除する（解除すると「今日」が基準になる）。
 */
export const DEMO_REFERENCE_DATE = "2026-09-30";

/**
 * LINE の一括紐付け API に 1 回で送る人数。
 * 公式の上限値はまだ確認できていないため、十分に小さい暫定値にしてある。
 * フェーズ 3 の冒頭で実際の API を叩いて確認してから見直すこと。
 */
export const BULK_LINK_CHUNK_SIZE = 100;

/** 一括紐付けを依頼したまま、この時間が過ぎても確認できなければ「再依頼が必要」とみなす。 */
export const REQUESTED_STALE_MS = 10 * 60 * 1000;

/** 紐付けコードの桁数。 */
export const LINK_CODE_LENGTH = 8;
