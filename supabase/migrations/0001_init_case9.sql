-- 案件9「LINE購買連動リッチメニュー自動切替システム」初期スキーマ
--
-- project8（case8）と同じ Supabase プロジェクトに同居させるため、
-- 全てのオブジェクトを "case9" スキーマの中に作る（project7/project8 と同じ流儀）。
--
-- project8 との違い：project9 は Supabase Auth を使わず、管理画面のログインは
-- jose（Cookie セッション）+ bcrypt の自前実装（project1 と同じ方式）。
-- そのため "authenticated" ロールへの権限は一切与えない。すべてのアクセスは
-- サーバー側の service_role 経由（Server Action と DB 関数）のみで行う。
--
-- 実行方法: Supabase ダッシュボードの SQL Editor にこのファイルの内容を貼り付けて実行する。
-- 実行後、Settings → API → Exposed schemas に "case9" を追加すること
-- （追加しないと PostgREST 経由でこのスキーマが見えない）。
-- 何度実行しても安全なように IF NOT EXISTS を使っている（テーブル本体を除く。
-- テーブル定義を変更する場合は別マイグレーションとして追加すること）。

CREATE SCHEMA IF NOT EXISTS case9;

-- ============================================================
-- updated_at を自動更新する共通トリガー関数
-- ============================================================
CREATE OR REPLACE FUNCTION case9.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- customers: 顧客。LINE との紐付けはここ1箇所だけが正
-- ============================================================
-- line_user_id を「紐付けの正」にする（line_friends 側には持たせない）。
-- README の「実装の進み具合」どおり、セグメントの自動判定は TS の純粋関数
-- （src/lib/segment/classify.ts）が行い、結果をここに書き戻す。
CREATE TABLE case9.customers (
  customer_id       TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  line_user_id      TEXT UNIQUE,
  segment           TEXT CHECK (segment IN ('new', 'repeater', 'vip', 'dormant')),
  segment_override  TEXT CHECK (segment_override IN ('new', 'repeater', 'vip', 'dormant')),
  applied_richmenu_id TEXT,
  sync_status       TEXT NOT NULL DEFAULT 'not_linked'
                      CHECK (sync_status IN ('not_linked', 'pending', 'requested', 'in_sync', 'failed')),
  sync_requested_at TIMESTAMPTZ,
  sync_error        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- メールアドレスは必ず小文字で保存する（CSV検証時に小文字化してから渡す前提）
  CHECK (email = lower(email))
);
COMMENT ON TABLE case9.customers IS '案件9: 顧客。line_user_id が LINE との紐付けの唯一の正';

CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON case9.customers
  FOR EACH ROW EXECUTE FUNCTION case9.set_updated_at();

-- ============================================================
-- orders: 注文。1行 = CSV の1行。order_id で重複を排除しながら積み上げる
-- ============================================================
-- customer_id, order_date, product_name, quantity, amount は CSV の列と対応する
-- （customer_email は customers 側で管理するのでここには持たない）。
CREATE TABLE case9.orders (
  order_id      TEXT PRIMARY KEY,
  customer_id   TEXT NOT NULL REFERENCES case9.customers(customer_id),
  order_date    DATE NOT NULL,
  product_name  TEXT NOT NULL,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  amount        NUMERIC(12, 0) NOT NULL CHECK (amount >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE case9.orders IS '案件9: 注文明細。order_id が重複排除のキー（累積するので削除しない）';

-- 「この顧客の全注文」を読む集計クエリのためのインデックス
CREATE INDEX orders_customer_id_idx ON case9.orders(customer_id);

-- ============================================================
-- link_codes: LINEユーザーと顧客を結びつけるコード
-- ============================================================
-- 未使用コードは顧客ごとに1個まで（部分ユニークインデックス）。
-- 再発行するときは、既存の未使用コードをまず失効させてから新しい行を作る。
CREATE TABLE case9.link_codes (
  code          TEXT PRIMARY KEY,
  customer_id   TEXT NOT NULL REFERENCES case9.customers(customer_id),
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  line_user_id  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE case9.link_codes IS '案件9: 顧客とLINEユーザーを結びつけるコード（顧客ごとに未使用は1個まで）';

CREATE UNIQUE INDEX link_codes_one_unused_per_customer
  ON case9.link_codes(customer_id) WHERE used_at IS NULL;

-- ============================================================
-- line_friends: LINEの友だち一覧（紐付けの正ではなく、友だち管理用の台帳）
-- ============================================================
CREATE TABLE case9.line_friends (
  line_user_id    TEXT PRIMARY KEY,
  followed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked         BOOLEAN NOT NULL DEFAULT false,
  guidance_count  INTEGER NOT NULL DEFAULT 0,
  last_guided_at  TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE case9.line_friends IS '案件9: LINE友だちの台帳。未紐付けの友だち＝customersにline_user_idが無い人';

CREATE TRIGGER line_friends_set_updated_at
  BEFORE UPDATE ON case9.line_friends
  FOR EACH ROW EXECUTE FUNCTION case9.set_updated_at();

-- ============================================================
-- line_events: Webhookの再送対策（処理"後"に記録する）
-- ============================================================
CREATE TABLE case9.line_events (
  webhook_event_id TEXT PRIMARY KEY,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE case9.line_events IS '案件9: 処理済みWebhookイベントID。再送の重複処理を防ぐ';

-- ============================================================
-- link_attempts / admin_login_attempts: 総当たり対策
-- ============================================================
CREATE TABLE case9.link_attempts (
  line_user_id  TEXT PRIMARY KEY,
  failed_count  INTEGER NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE case9.link_attempts IS '案件9: コード入力の失敗回数（LINEユーザー単位）';

CREATE TRIGGER link_attempts_set_updated_at
  BEFORE UPDATE ON case9.link_attempts
  FOR EACH ROW EXECUTE FUNCTION case9.set_updated_at();

-- IP単位で制限する（管理者は1人なので、アカウント単位でロックすると
-- 第三者がわざと失敗させて管理者を締め出せてしまうため）
CREATE TABLE case9.admin_login_attempts (
  ip            TEXT PRIMARY KEY,
  failed_count  INTEGER NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE case9.admin_login_attempts IS '案件9: 管理画面ログインの失敗回数（IP単位）';

CREATE TRIGGER admin_login_attempts_set_updated_at
  BEFORE UPDATE ON case9.admin_login_attempts
  FOR EACH ROW EXECUTE FUNCTION case9.set_updated_at();

-- ============================================================
-- richmenus: セグメント別 + 未紐付け用のリッチメニュー登録状況
-- ============================================================
CREATE TABLE case9.richmenus (
  slot            TEXT PRIMARY KEY CHECK (slot IN ('unlinked', 'new', 'repeater', 'vip', 'dormant')),
  line_richmenu_id TEXT,
  areas           JSONB,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE case9.richmenus IS '案件9: 5枠（未紐付け用+4セグメント）のリッチメニュー登録状況';

CREATE TRIGGER richmenus_set_updated_at
  BEFORE UPDATE ON case9.richmenus
  FOR EACH ROW EXECUTE FUNCTION case9.set_updated_at();

-- 5枠を先に用意しておく（管理画面の「メニュー設定」は最初からこの5行を更新する形にする）
INSERT INTO case9.richmenus (slot) VALUES
  ('unlinked'), ('new'), ('repeater'), ('vip'), ('dormant')
ON CONFLICT (slot) DO NOTHING;

-- ============================================================
-- segment_settings: 運用者が変更できる判定条件（1行だけの設定テーブル）
-- ============================================================
-- reference_date の初期値は README の正解値と同じ 2026-09-30 に固定してある。
-- 固定中は管理画面に警告バナーを出す（本番運用に切り替えるときは NULL に戻す＝今日基準）。
CREATE TABLE case9.segment_settings (
  id              BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  vip_threshold   NUMERIC(12, 0) NOT NULL DEFAULT 30000,
  repeat_months   INTEGER NOT NULL DEFAULT 6,
  reference_date  DATE DEFAULT '2026-09-30',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE case9.segment_settings IS '案件9: 判定条件の設定（1行固定）。reference_dateがNULLなら今日(JST)基準';

CREATE TRIGGER segment_settings_set_updated_at
  BEFORE UPDATE ON case9.segment_settings
  FOR EACH ROW EXECUTE FUNCTION case9.set_updated_at();

INSERT INTO case9.segment_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- import_jobs: CSV取り込みの履歴（画面の「処理状況」表示に使う）
-- ============================================================
CREATE TABLE case9.import_jobs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename              TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'running'
                          CHECK (status IN ('running', 'success', 'failed')),
  total_rows            INTEGER,
  new_order_count       INTEGER,
  duplicate_count       INTEGER,
  conflict_order_ids    JSONB,
  new_customer_ids      JSONB,
  segment_counts        JSONB,
  changed_customer_count INTEGER,
  error_message         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at           TIMESTAMPTZ
);
COMMENT ON TABLE case9.import_jobs IS '案件9: CSV取り込みの履歴。書き込みはService Action側で行う（DB関数の外）';

-- ============================================================
-- ai_summaries: AI要約と、二重課金防止の先取りロック
-- ============================================================
-- import_job_id を PRIMARY KEY にすることで「先に行を確保できた1回だけが生成する」
-- という先取りロックにしている（INSERT ... ON CONFLICT DO NOTHING で判定する）。
CREATE TABLE case9.ai_summaries (
  import_job_id   UUID PRIMARY KEY REFERENCES case9.import_jobs(id),
  status          TEXT NOT NULL DEFAULT 'generating'
                    CHECK (status IN ('generating', 'ready', 'failed')),
  content         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE case9.ai_summaries IS '案件9: AIによるセグメント構成の要約。判定には使わない（表示のみ）';

CREATE TRIGGER ai_summaries_set_updated_at
  BEFORE UPDATE ON case9.ai_summaries
  FOR EACH ROW EXECUTE FUNCTION case9.set_updated_at();

-- ============================================================
-- RLS: 全テーブルで有効化し、ポリシーは0個
-- ============================================================
-- project9 はブラウザから直接 Supabase を呼ばない設計（Supabase Auth も使わない）。
-- 全アクセスはサーバー側の service_role 経由のみなので、authenticated / anon への
-- ポリシーは一切作らない（project8 の GRANT USAGE TO anon はここではコピーしない）。
ALTER TABLE case9.customers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE case9.orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE case9.link_codes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE case9.line_friends          ENABLE ROW LEVEL SECURITY;
ALTER TABLE case9.line_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE case9.link_attempts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE case9.admin_login_attempts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE case9.richmenus             ENABLE ROW LEVEL SECURITY;
ALTER TABLE case9.segment_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE case9.import_jobs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE case9.ai_summaries          ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 権限: service_role のみ（anon / authenticated には何も与えない）
-- ============================================================
GRANT USAGE ON SCHEMA case9 TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA case9 TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA case9 GRANT ALL ON TABLES TO service_role;

-- ============================================================
-- DB関数1: redeem_link_code — コードの照合と紐付け（アトミック・冪等）
-- ============================================================
-- 「未使用なら使用済みにする」を1回のUPDATEで行うため、同時に同じコードが
-- 送られても先着1件しか成立しない（レースコンディション対策）。
-- 戻り値: ok / invalid / expired / used / customer_already_linked / line_user_already_linked
CREATE OR REPLACE FUNCTION case9.redeem_link_code(code_in TEXT, line_user_id_in TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = case9, pg_temp
AS $$
DECLARE
  v_claimed_customer_id TEXT;
  v_claimed_rows        INT;
  v_row                 case9.link_codes%ROWTYPE;
  v_existing_line_user_id TEXT;
BEGIN
  IF code_in IS NULL OR line_user_id_in IS NULL OR line_user_id_in = '' THEN
    RETURN 'invalid';
  END IF;

  -- ステップ1: コードを先着確定で「使用済み」にする
  UPDATE case9.link_codes
    SET used_at = now(), line_user_id = line_user_id_in
    WHERE code = code_in AND used_at IS NULL AND expires_at >= now()
    RETURNING customer_id INTO v_claimed_customer_id;
  GET DIAGNOSTICS v_claimed_rows = ROW_COUNT;

  IF v_claimed_rows = 0 THEN
    -- 先着になれなかった理由を調べる：存在しない／使用済み／期限切れ
    SELECT * INTO v_row FROM case9.link_codes WHERE code = code_in;
    IF NOT FOUND THEN
      RETURN 'invalid';
    ELSIF v_row.used_at IS NOT NULL THEN
      -- 同じ人が同じコードをもう一度送ってきた場合は、成功として扱う（冪等）
      RETURN CASE WHEN v_row.line_user_id = line_user_id_in THEN 'ok' ELSE 'used' END;
    ELSE
      RETURN 'expired';
    END IF;
  END IF;

  -- ステップ2: 顧客への紐付け。すでに別のLINEユーザーが紐付いていれば拒否する
  SELECT line_user_id INTO v_existing_line_user_id
    FROM case9.customers WHERE customer_id = v_claimed_customer_id;

  IF v_existing_line_user_id IS NOT NULL AND v_existing_line_user_id <> line_user_id_in THEN
    RETURN 'customer_already_linked';
  END IF;

  IF v_existing_line_user_id IS NULL THEN
    BEGIN
      UPDATE case9.customers
        SET line_user_id = line_user_id_in
        WHERE customer_id = v_claimed_customer_id;
    EXCEPTION WHEN unique_violation THEN
      -- この line_user_id が（同時に）別の顧客に紐付けられた場合
      RETURN 'line_user_already_linked';
    END;
  END IF;

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION case9.redeem_link_code(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION case9.redeem_link_code(TEXT, TEXT) TO service_role;

-- ============================================================
-- DB関数2: import_orders — 注文の取り込み（1トランザクション）
-- ============================================================
-- 引数 rows_in は OrderRow[] を JSON にしたもの（キーはスネークケース）。
-- 顧客のメール食い違いが1件でもあれば、例外を投げて全体を中止する
-- （supabase-js にトランザクションが無いため、書き込みは必ずこの関数の中で完結させる）。
-- 戻り値: { new_order_count, duplicate_count, conflict_order_ids, new_customer_ids }
--
-- import_jobs（履歴）の作成・更新はこの関数の外（Server Action側）で行う。
-- 履歴の記録は「ログ」であり、注文の書き込みとアトミックである必要は無いため、
-- 関数を単純に保つ目的で分離した（プラン初版からの変更点）。
CREATE OR REPLACE FUNCTION case9.import_orders(rows_in JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = case9, pg_temp
AS $$
DECLARE
  v_conflicts          JSONB;
  v_new_customer_ids   JSONB;
  v_new_order_count    INT;
  v_duplicate_count    INT;
  v_conflict_order_ids JSONB;
BEGIN
  -- 1) 登録済みの顧客IDで、メールアドレスが違う行が無いか
  SELECT jsonb_agg(jsonb_build_object('customer_id', t.customer_id, 'reason', 'email_mismatch'))
    INTO v_conflicts
  FROM (
    SELECT DISTINCT customer_id, lower(customer_email) AS customer_email
    FROM jsonb_to_recordset(rows_in) AS t(customer_id TEXT, customer_email TEXT)
  ) t
  JOIN case9.customers c ON c.customer_id = t.customer_id
  WHERE c.email <> t.customer_email;

  IF v_conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'customer_conflict' USING DETAIL = v_conflicts::TEXT, ERRCODE = 'P0001';
  END IF;

  -- 2) 同じメールアドレスが、別の登録済み顧客IDに使われていないか
  SELECT jsonb_agg(jsonb_build_object('customer_id', t.customer_id, 'reason', 'email_in_use'))
    INTO v_conflicts
  FROM (
    SELECT DISTINCT customer_id, lower(customer_email) AS customer_email
    FROM jsonb_to_recordset(rows_in) AS t(customer_id TEXT, customer_email TEXT)
  ) t
  JOIN case9.customers c ON c.email = t.customer_email AND c.customer_id <> t.customer_id;

  IF v_conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'customer_conflict' USING DETAIL = v_conflicts::TEXT, ERRCODE = 'P0001';
  END IF;

  -- 3) 新しい顧客を登録する
  WITH inserted_customers AS (
    INSERT INTO case9.customers (customer_id, email)
    SELECT DISTINCT customer_id, lower(customer_email)
    FROM jsonb_to_recordset(rows_in) AS t(customer_id TEXT, customer_email TEXT)
    ON CONFLICT (customer_id) DO NOTHING
    RETURNING customer_id
  )
  SELECT jsonb_agg(customer_id) INTO v_new_customer_ids FROM inserted_customers;

  -- 4) 注文を 新規 / 重複（同一内容） / 内容相違 に分類して数える
  --    内容相違の行は上書きしない（件数だけ報告し、運用者の判断に委ねる）
  WITH incoming AS (
    SELECT * FROM jsonb_to_recordset(rows_in) AS t(
      order_id TEXT, order_date DATE, customer_id TEXT,
      customer_email TEXT, product_name TEXT, quantity INT, amount NUMERIC
    )
  ),
  classified AS (
    SELECT
      i.order_id,
      e.order_id IS NULL AS is_new,
      (e.order_id IS NOT NULL
        AND e.customer_id = i.customer_id
        AND e.order_date = i.order_date
        AND e.product_name = i.product_name
        AND e.quantity = i.quantity
        AND e.amount = i.amount) AS is_duplicate
    FROM incoming i
    LEFT JOIN case9.orders e ON e.order_id = i.order_id
  )
  SELECT
    count(*) FILTER (WHERE is_new),
    count(*) FILTER (WHERE NOT is_new AND is_duplicate),
    jsonb_agg(order_id) FILTER (WHERE NOT is_new AND NOT is_duplicate)
  INTO v_new_order_count, v_duplicate_count, v_conflict_order_ids
  FROM classified;

  INSERT INTO case9.orders (order_id, customer_id, order_date, product_name, quantity, amount)
  SELECT t.order_id, t.customer_id, t.order_date, t.product_name, t.quantity, t.amount
  FROM jsonb_to_recordset(rows_in) AS t(
    order_id TEXT, order_date DATE, customer_id TEXT,
    customer_email TEXT, product_name TEXT, quantity INT, amount NUMERIC
  )
  WHERE NOT EXISTS (SELECT 1 FROM case9.orders e WHERE e.order_id = t.order_id);

  RETURN jsonb_build_object(
    'new_order_count', v_new_order_count,
    'duplicate_count', v_duplicate_count,
    'conflict_order_ids', COALESCE(v_conflict_order_ids, '[]'::JSONB),
    'new_customer_ids', COALESCE(v_new_customer_ids, '[]'::JSONB)
  );
END;
$$;

REVOKE ALL ON FUNCTION case9.import_orders(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION case9.import_orders(JSONB) TO service_role;
