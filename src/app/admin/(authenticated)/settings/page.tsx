import { SegmentSettingsForm } from "@/components/admin/SegmentSettingsForm";
import { getSegmentSettings } from "@/lib/settings/read";

export default async function AdminSettingsPage() {
  const settings = await getSegmentSettings();

  const lineConnected = Boolean(
    process.env.LINE_CHANNEL_SECRET && process.env.LINE_CHANNEL_ACCESS_TOKEN,
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">LINE接続・設定</h1>

      <div className="rounded-xl border border-brand-border bg-white p-4">
        <h2 className="font-semibold">LINE公式アカウントの接続状態</h2>
        <p className="mt-2 text-sm">
          {lineConnected ? (
            <span className="text-green-700">接続情報が設定されています</span>
          ) : (
            <span className="text-brand-espresso-soft">
              未設定です（フェーズ3で LINE_CHANNEL_SECRET /
              LINE_CHANNEL_ACCESS_TOKEN を設定します）
            </span>
          )}
        </p>
      </div>

      <SegmentSettingsForm initial={settings} />
    </div>
  );
}
