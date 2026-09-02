'use client';

// 古い環境や、アプリ内ブラウザ(LINEなど)、http接続では、これらのAPIが存在しないことがある。
// 無いものを直接呼ぶとその場でTypeErrorになり、ボタンが黙って効かなくなるので、
// ここで一度受け止めてから使う。

// navigator.clipboard は安全なコンテキスト(https/localhost)でしか生えない。
// 古いWebViewでも動くよう、旧来の execCommand('copy') を控えとして持つ。
export async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 権限拒否などは控えの手段に回す。
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

// 読み上げ非対応の端末では、ボタン自体を出さないために使う。
export function canReadAloud() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function readAloud(text: string, lang = 'ja-JP') {
  if (!canReadAloud()) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    window.speechSynthesis.speak(utterance);
  } catch {
    // 読み上げできなくても、会話そのものは続けられる。
  }
}

// プライベートモードや制限付きWebViewでは、読み書きどちらも例外を投げることがある。
export function readStored(storage: 'local' | 'session', key: string) {
  try { return (storage === 'local' ? window.localStorage : window.sessionStorage).getItem(key); } catch { return null; }
}

export function writeStored(storage: 'local' | 'session', key: string, value: string) {
  try { (storage === 'local' ? window.localStorage : window.sessionStorage).setItem(key, value); } catch { /* 保存できなくても動作は続く */ }
}

export function removeStored(storage: 'local' | 'session', key: string) {
  try { (storage === 'local' ? window.localStorage : window.sessionStorage).removeItem(key); } catch { /* 同上 */ }
}
