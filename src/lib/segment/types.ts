/** 顧客セグメント。内部では英語キー、画面では日本語ラベルを使う。 */
export const SEGMENTS = ["new", "repeater", "vip", "dormant"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const SEGMENT_LABELS: Record<Segment, string> = {
  new: "新規",
  repeater: "リピーター",
  vip: "VIP",
  dormant: "休眠",
};

/** 判定に必要な注文の最小情報。 */
export type OrderLite = {
  customerId: string;
  orderDate: string; // "YYYY-MM-DD"
  amount: number;
};

/** 運用者が管理画面で変更できる判定条件。 */
export type SegmentSettings = {
  vipThreshold: number;
  repeatMonths: number;
};

/** 1 人分の判定結果。reason は「なぜこのセグメントか」を画面で説明するための文。 */
export type Classification = {
  segment: Segment;
  reason: string;
  orderCount: number;
  totalAmount: number;
  lastOrderDate: string | null;
};

export type SegmentChange = {
  customerId: string;
  from: Segment | null; // null = 今回初めて判定された顧客
  to: Segment;
};
