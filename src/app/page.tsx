export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium tracking-wide text-brand-caramel">
        模擬案件 9
      </p>
      <h1 className="mt-3 text-3xl font-bold leading-tight">
        購買連動リッチメニュー
        <br />
        自動切替システム
      </h1>
      <p className="mt-5 leading-relaxed text-brand-espresso-soft">
        購入履歴に応じて、LINE
        のメニューを顧客ごとに自動で出し分ける管理システムです。
        現在は開発中のため、管理画面は準備中です。
      </p>
    </main>
  );
}
