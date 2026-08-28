import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '家族のおしゃべり',
  description: '家族の会話だけに集中できる、シンプルな家族専用メッセンジャー',
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
      <body>{children}</body>
    </html>
  );
}
