import entry from 'vinext/server/app-router-entry';

// Workerの入り口をここで包んで、全レスポンスにセキュリティヘッダを付ける。
//
// なぜ設定ファイルではなくコードなのか:
//   - public/_headers は静的アセットにしか効かない(HTMLはWorkerが生成しているため対象外)
//   - next.config.ts の headers() は、この構成ではAPIルートにしか配線されていない
// 一番守りたいHTMLページがどちらにも入らないので、入り口を包むのが唯一の確実な方法。
const SECURITY_HEADERS: Record<string, string> = {
  // 他サイトのiframeに埋め込ませない(クリックジャッキング対策)。
  'X-Frame-Options': 'DENY',
  // MIMEタイプの推測を止める。
  'X-Content-Type-Options': 'nosniff',
  // 外部リンクを踏んだとき、URLのパス(招待トークン等)を相手に渡さない。
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // 使っていない端末機能は明示的に閉じる(マイクは音声入力に使うので残す)。
  'Permissions-Policy': 'camera=(), geolocation=(), payment=(), usb=(), microphone=(self)',
  // 万一XSSの穴ができても、注入されたコードが動かないようにする保険。
  // このアプリは外部スクリプトもCDNも使わず、画像はdata:のQRコードと自前のSVGだけ。
  'Content-Security-Policy': [
    "default-src 'self'",
    // React(vinext)の水和にインラインスクリプトが要る。外部のsrcは許可しない。
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    // 招待QRの生成などで使う。
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; '),
};

export default {
  async fetch(request: Request, env?: Parameters<typeof entry.fetch>[1], ctx?: Parameters<typeof entry.fetch>[2]) {
    const response = await entry.fetch(request, env, ctx);
    // レスポンスは不変なので、ヘッダを足すには作り直す必要がある。
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);

    // HTMLは毎回サーバーに確認しに行かせる。
    // HTMLには、その時点のJSファイル名(内容ハッシュ付き)が書かれている。古いHTMLが
    // 端末に residual すると、そこが指すJSは次のデプロイで配信対象から外れているため、
    // アプリが開かなくなる。利用者には再インストール以外に直す手段がない。
    // JS/CSS側はファイル名が変わる作りなので、従来どおり長期キャッシュのままでよい。
    if ((headers.get('content-type') ?? '').startsWith('text/html') && !headers.has('cache-control')) {
      headers.set('Cache-Control', 'no-cache');
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
