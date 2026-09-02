// 音声認識が返してくる文の断片を、重複させずに積み上げる。
//
// 端末は「同じ発話が少しずつ伸びていくスナップショット」を何度も返してくる。
// しかも途中で言い直す。素朴につなげると同じ文が何度も足されて何倍にも膨らむ。
//
// 直前の断片と見比べて、同じ発話なら置き換え、別の発話なら足す。この判定は
// 「1回の結果配列の中」でも「セッションをまたぐとき」でも同じなので、ここに集約する。

// 共通部分の長さ(最長共通部分列)。言い直しは文の途中や先頭でも起きるため、
// 先頭一致では測れない。「Cお姉ちゃんなく」と「Cお姉じゃなくて」は先頭が
// 3文字しか一致しないが、全体では大部分が共通している。
function commonLength(a: string, b: string) {
  let previous = new Uint16Array(b.length + 1);
  let current = new Uint16Array(b.length + 1);
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      current[j + 1] = a[i] === b[j] ? previous[j] + 1 : Math.max(current[j], previous[j + 1]);
    }
    [previous, current] = [current, previous];
    current.fill(0);
  }
  return previous[b.length];
}

// 短い語どうしは、言い直しなのか別の単語なのか区別できない。無理に畳んで実際に
// 話した言葉を消すより、重複が残る方を選ぶ。
const SIMILAR_RATIO = 0.6;

export function mergeSpoken(parts: readonly string[], part: string): string[] {
  if (!part) return [...parts];
  const previous = parts[parts.length - 1];
  if (previous === undefined) return [part];

  const sameUtterance = part.startsWith(previous)
    || previous.startsWith(part)
    || commonLength(previous, part) >= Math.min(previous.length, part.length) * SIMILAR_RATIO;

  if (!sameUtterance) return [...parts, part];
  return [...parts.slice(0, -1), part.length >= previous.length ? part : previous];
}

export function joinSpoken(parts: readonly string[]) {
  return parts.join('');
}
