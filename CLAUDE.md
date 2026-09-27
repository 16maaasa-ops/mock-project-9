# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## このリポジトリの現状

**Step 3（実装）のフェーズ 2 が完了。** Supabase（`case9`スキーマ）・管理画面ログイン・
CSV取り込み・顧客一覧・設定画面ができている。リッチメニュー登録・LINE連携・AI要約はこれから
（実装計画の全体は README の「実装の進み具合」を参照）。

実装済み（`src/lib/`）：日付計算 / セグメント判定（判定理由つき）/ CSV 検証 / 取り込み前プレビュー /
紐付けコードの生成と入力解釈 / メニュー同期の計画（`planSync`）/ LINE 署名検証 /
Supabase サーバークライアント（`case9`スキーマ固定）/ 管理画面ログイン（jose + bcrypt、
IP単位の試行制限つき）/ セグメント設定の読み書きと影響プレビュー / 全顧客のセグメント一括再計算 /
CSV取り込みのServer Action（`import_orders` RPC呼び出し＋履歴記録）/ 顧客一覧の集計・検索・絞り込み /
紐付けコードの発行・案内文コピー / 手動セグメント指定。

画面：`/admin/login`（ログイン）、`/admin`（ダッシュボード・初回チェックリスト）、
`/admin/settings`（判定条件・LINE接続状態・変更影響プレビュー）、
`/admin/import`（CSV取り込み・取り込み前確認・履歴）、
`/admin/customers`（一覧・検索・絞り込み・詳細パネル・コード発行・手動指定）が実装済み。
ブラウザで実際にログイン→CSV2本（初回48件・追加5件+重複2件）を取り込み、
README正解値（新規5/リピーター7/VIP4/休眠2、切替対象3人）と一致することを確認済み。
`/admin/richmenus` だけがまだ「準備中」のプレースホルダー（フェーズ3で実装）。

**Supabaseに動作確認用のテストデータが入っている**（`customers`18件・`orders`53件・
`link_codes`1件・`import_jobs`2件）。ユーザーの意向で削除せず残している。
フェーズ3以降もこのデータを使い続ける前提。本番の実データを入れる前には全件削除すること。

DBマイグレーションは2本（`supabase/migrations/`）を実行済み: `0001_init_case9.sql`（スキーマ本体）、
`0002_admin_login_attempts_fn.sql`（ログイン試行制限の関数）。

Git リポジトリ：GitHub `https://github.com/16maaasa-ops/mock-project-9`（Public）にpush済み。
Vercel：本番デプロイ済み（Supabase・案件8共有のAI Gatewayの接続情報を環境変数に設定済み）。

コマンド（すべて `package.json` に実在）：

| コマンド             | 内容                                                                         |
| -------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`        | 開発サーバー                                                                 |
| `npm test`           | Vitest。README の正解値との突き合わせ（`tests/readme-golden.test.ts`）を含む |
| `npm run type-check` | `next typegen` + `tsc --noEmit`                                              |
| `npm run lint`       | ESLint                                                                       |
| `npm run build`      | 本番ビルド。`prebuild` で `npm test` が走り、失敗すればビルドも止まる        |

**実装が進んだら、この「現状」セクションを必ず更新すること。**
（project7・project8 では実装完了後も「コードは未着手」のまま残ってしまった前例がある）

- パッケージ管理は **npm**。Next.js は `16.3.6`（`16.3.2` 以前は重大な脆弱性があるため上げてある。固定して使う）
- 構成は Next.js（App Router・`src/` 配下）+ Vercel + Supabase
- 純粋ロジックには `import "server-only"` を付けないこと（Vitest から読めなくなる）
- 環境変数の一覧は README の「環境変数」を参照（`.env.example` は保護設定で作れなかったため README に書いている）
- 既知の警告：`npm audit` に Vitest（テスト実行時だけ使う開発用ツール）の中程度の指摘が 1 件ある。
  修正には Vitest 5 への大きな更新が必要で、本番の動作には影響しないため見送っている
- **`ADMIN_PASSWORD_HASH` を再発行するときの注意**：Next.js は `.env*` ファイルの中の `$変数名` を
  「他の変数を参照する記法」として展開する仕様がある（[公式ドキュメント](https://nextjs.org/docs/app/guides/environment-variables)）。
  bcryptのハッシュは `$2b$10$...` のように `$` を含むため、そのまま書くと展開されて値が壊れる。
  `.env.local` に書くときは `$` を `\$` にエスケープすること（例:
  `ADMIN_PASSWORD_HASH=\$2b\$10\$...`）。これに気づかず「値は合っているのにログインできない」
  という事象で1回ハマった
- **`"use server"` を付けたファイルは、非同期関数以外を export できない**。定数（例:
  `export const FOO = "bar"`）を1つ混ぜただけでビルドエラーになる。Server Action 用のファイル
  （`src/lib/*/actions.ts`）には関数以外を置かないこと
- **IP判定はローカル環境で `curl` とブラウザで別バケットになりうる**：開発中、`curl` 経由は
  `x-forwarded-for` が無く `"unknown"`、Chrome経由は `"::1"`（IPv6ループバック）として記録された。
  ログイン試行制限のテスト中に意図せずロックしたら、`admin_login_attempts` テーブルを見て
  該当IPを確認し、`reset_admin_login_attempts` RPCで解除すること
- **Supabaseに動作確認用のテストデータが残っている**（上の「このリポジトリの現状」参照）。
  読み込み・書き込みのテストに使ってよいが、本番投入前は消すこと

## プロジェクト概要

D2C 定期通販ブランド（コーヒー定期便を仮置き）の LINE 公式アカウント向けに、購入履歴から
顧客を 4 つのセグメントに分け、**セグメントごとに LINE のリッチメニューを自動で出し分ける**システム。
AI エンジニアリングの模擬案件（案件 9）。フリーランス営業用ポートフォリオに載せる成果物。

差別化の軸は **「購買データ → リッチメニュー切替」の一点**。次は既存案件で実装済みなので持ち込まない。

| 既存案件 | 実装済みの機能（project9 では作らない）                      |
| -------- | ------------------------------------------------------------ |
| project1 | FAQ への AI 自動応答・有人エスカレーション・オーナー管理画面 |
| project5 | 問い合わせの集約・AI 分類・Slack 通知                        |
| project8 | EC 売上の KPI 集計ダッシュボード                             |

現在は **Step 2（提案・設計フェーズ）**。実装は Step 3。

## アーキテクチャ

```
運用担当者 → Next.js on Vercel（管理画面 / CSV 取り込み / セグメント判定）
                ├→ Supabase（customers / orders / link_codes / richmenus / import_jobs）
                ├→ LINE Messaging API（リッチメニュー作成・紐付け）
                └→ AI Gateway 経由の Claude（セグメント構成の要約のみ）
LINE 友だち → Webhook（署名検証 → コード照合 → 顧客と LINE ユーザーを紐付け）
```

## 譲れない設計ルール

ヒアリングとレビュー（ui-reviewer・senior-engineer の 2 体）で確定済み。変更する場合はユーザーに確認すること。

- **セグメントは 4 区分に固定**（新規 / リピーター / VIP / 休眠）。カテゴリ別などの細分化は Phase 2
- **判定は決定木で確定的に行う。AI は判定に使わない**。順序は README の表の通り
  （① 購入 1 回以下→新規 ② 累計≧閾値→VIP ③ 最終購入が基準日の 6 ヶ月前以降→リピーター ④ 休眠）。
  判定関数は「基準日」を引数に取る純粋関数にし、テストでは `2026-09-30` に固定する
- **AI の役割は「セグメント構成の要約コメント」1 か所だけ**。画面上に「AI による要約」と明示する。
  プロンプトは 1 ファイルに集約し（project8 の `lib/analysis/prompt.ts` に倣う）、出力は JSON で受ける。
  AI Gateway 経由で `generateText` + `Output.object()`（`generateObject` は使わない）
- **注文は `order_id` を一意キーにして積み上げる**。同じ `order_id` の行はスキップ。
  project8 の「最新のアップロードだけ残す」保存方式は使わない（累計判定が壊れるため）。
  CSV のパース・検証ロジックだけは project8 の `lib/csv/` を参考にしてよい
- **顧客と LINE ユーザーの紐付けはコード入力方式**。コードは推測しにくい十分長いランダム文字列
  （8 桁以上）、有効期限つき。照合は「未使用なら使う」を **1 回の DB 更新でアトミックに**行う
  （例：`UPDATE ... SET used_at = now(), line_user_id = ? WHERE code = ? AND used_at IS NULL`）。
  同時に 2 人が同じコードを送っても先着 1 人だけが成立するように。
  project1 のコード方式は「単一の設定値との比較」で構造が違うため、流用するのは
  Webhook の署名検証と再送の重複排除（`line_message_id` の unique 制約）の枠組みだけ
- **リッチメニューの切替は「セグメントが変わった顧客だけ」を対象にする**。顧客ごとに
  「現在紐付けているメニュー ID」と「同期状態（成功 / 要再試行）」を DB に持つ
- **メニュー画像はセグメントごとに運用者が 1 枚用意**。AI での画像生成はしない
- **LIFF は使わない**。**注文データの取り込みは CSV のみ**（Shopify 等との直接連携は Phase 2）
- **期間軸・データ規模**：数十〜百人規模の簡易実装。API 呼び出しの非同期キュー化は Phase 2

## LINE Messaging API：確認済みの事実 / 未検証の事項

確認方法は 2026-09 時点の LINE 公式ドキュメントと LINE 公式の API 仕様ファイル
（`line/line-openapi` の `messaging-api.yml`）。

**確認済み**

- ユーザー個別の紐付け：`POST /v2/bot/user/{userId}/richmenu/{richMenuId}`
- **複数ユーザーの一括紐付け**：`POST /v2/bot/richmenu/bulk/link`（応答は `202 Accepted`）
  ／ 一括解除：`POST /v2/bot/richmenu/bulk/unlink`。
  ※ 202 は「受け付けた」だけで処理完了ではない（非同期）。レビュー時の「一括 API は無い」という指摘は誤り
- デフォルトのリッチメニューは「ユーザー個別メニューが紐付いていない友だち」に表示される
  ＝ ユーザー個別が優先される

**未検証（実装着手前に LINE 公式ドキュメントで必ず確認すること。推測で数値を書かない）**

- リッチメニュー画像の形式・ファイルサイズ上限・ピクセルサイズ（管理画面の事前チェックに使う）
- タップ領域（areas）の最大数、1 チャネルで作れるリッチメニュー数の上限
- 一括紐付けで 1 回に指定できるユーザー数の上限、レート制限
- 一括紐付け（非同期）の完了をどう確認するか（ユーザーの現在のメニューを取得する API で照合するか等）
- Messaging API の料金プラン上、メニュー紐付け自体に課金が発生しないか

## DB 設計（案。Step 3 で確定する）

- `customers`：`customer_id`（主キー）, `email`, `line_user_id`（未紐付けなら NULL）, `segment`,
  `applied_richmenu_id`, `sync_status`
- `orders`：`order_id`（主キー＝重複排除のキー）, `customer_id`, `order_date`, `product_name`, `quantity`, `amount`
- `link_codes`：`code`（unique）, `customer_id`, `expires_at`, `used_at`, `line_user_id`
- `segment_settings`：`vip_threshold`, `repeat_months`（運用者が管理画面で変更）
- `richmenus`：`segment`, `line_richmenu_id`, 画像の保存先
- `import_jobs`：取り込み単位の状態と件数（進行中 / 完了 / 一部失敗）

## 管理画面の要件（UI/UX レビューの反映）

- コード入力に失敗・未対応の顧客への**再案内送信**ボタン（放置するとデフォルトメニューのままになるため）
- メニュー画像の**推奨サイズ・容量の案内**と、アップロード時の**日本語エラー**、タップ領域の**プレビュー**
- CSV 取り込み〜メニュー反映の**処理状況表示**（件数つき。表示が変わらないと二重アップロードを招く）
- 顧客一覧は「紐付け済み / 未紐付け / セグメント別」で**絞り込み**。手動再割当は**個別と一括**の両方
- ポートフォリオ用に、**Before / After（メニューが切り替わる様子）が 1 枚で伝わる画面**を意図的に用意する
- LINE 友だち側のコード入力案内は、一般消費者向けの文言にする（なぜ必要か・何度でも入力し直せる旨・間違えにくい文字種）

## サンプルデータと「正解値」

`README.md` に正解値（初回 CSV 取り込み後 17 人、追加 CSV 取り込み後 18 人）を表で固定している。
実装の数字は必ずこれと突き合わせて確認すること。主なアンカー：

- 初回 CSV：**48 件 / 売上合計 ¥242,500 / 新規 5・リピーター 6・VIP 3・休眠 3**
- 追加 CSV：取り込み **5 件**・重複スキップ **2 件** → **新規 5・リピーター 7・VIP 4・休眠 2（18 人）**
- 追加後にメニュー切替の対象になる既存顧客は **3 人（C004・C010・C013）**。C005 は注文が増えても
  セグメント不変なので API を呼ばない

CSV の 7 列 `order_id, order_date, customer_id, customer_email, product_name, quantity, amount` は
`orders` / `customers` テーブルのカラムと対応させる。

## スコープ

**MVP（10 営業日想定）** … 顧客コード紐付け / CSV 取り込み（重複排除）/ セグメント判定 /
リッチメニュー自動切替 / 管理画面 / AI サマリー

**Phase 2 以降（MVP に混ぜないこと）** … EC サイトとの Webhook 直接連携 / LIFF ログイン /
複数店舗対応 / 数千人規模の非同期キュー化 / メニュー画像の AI 生成

運用コストは Vercel と Supabase の無料枠を前提とし、LINE 公式アカウントも無料の範囲で動く設計にする。

## 未決事項（実装前に確認すること）

1. 顧客と LINE の紐付けは **コード入力方式**で確定してよいか（LIFF にしない前提）
2. **判定ルールの一部は暫定**：「1 回きりなら高額でも新規」「VIP は最終購入が古くても VIP」
   「VIP 閾値 ¥30,000」「リピーターの期間 6 ヶ月」。クライアントの運用に合うか要確認
3. **休眠にも専用のメニュー画像を用意するか**（新規と同じメニューを流用する案もある）
4. LINE 公式アカウントの開発者アカウント取得とプラン（上の「未検証」の項目）
5. 想定クライアント業種（コーヒー定期便で仮置き。変更してよいか）
6. 認証：project1 と同じ「管理画面のログイン（1 アカウント）」でよいか

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
