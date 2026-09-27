import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "リッチメニュー自動切替 管理画面",
  description:
    "購入履歴に応じて LINE のリッチメニューを自動で出し分ける管理システム（模擬案件9）",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={`${notoSansJP.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-brand-cream text-brand-espresso">
        {children}
      </body>
    </html>
  );
}
