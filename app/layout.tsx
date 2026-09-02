import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '家族のおしゃべり',
  description: '家族の会話だけに集中できる、シンプルな家族専用メッセンジャー',
  // ホーム画面への追加は、開いた時点のHTMLにmanifestが無いとショートカットになってしまう。
  // JSで後から差し込むのでは間に合わないので、サーバーが返すHTMLに必ず含める。
  manifest: '/api/v1/app-manifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: '家族のおしゃべり' },
};

export const viewport: Viewport = {
  themeColor: '#2f6b4f',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      {/* Next.jsが出すのは現代的な mobile-web-app-capable のみ。古いiOSはこちらを見るので、
          ホーム画面から全画面で開けるように明示しておく(React 19がheadへ引き上げる)。 */}
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <body>{children}</body>
    </html>
  );
}
