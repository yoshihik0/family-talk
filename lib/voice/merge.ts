// 音声認識が返してくる文の断片を、重複させずに積み上げる。
//
// 端末は「同じ発話が少しずつ伸びていくスナップショット」を何度も返してくる。
// しかも途中で言い直す(「あはっと」→「あーっと」)。素朴につなげると、同じ文が
// 何度も足されて何倍にも膨らむ。
//
// 直前の断片と見比べて、同じ発話の続き・言い直しなら置き換え、別の発話なら足す。
// この判定は「1回の結果配列の中」でも「セッションをまたぐとき」でも同じなので、
// ここに集約して両方から使う。
export function mergeSpoken(parts: readonly string[], part: string): string[] {
  if (!part) return [...parts];
  const previous = parts[parts.length - 1];
  if (previous === undefined) return [part];

  let common = 0;
  while (common < previous.length && common < part.length && previous[common] === part[common]) common += 1;
  const sameUtterance = part.startsWith(previous)
    || previous.startsWith(part)
    || common >= Math.min(previous.length, part.length) * 0.6;

  if (!sameUtterance) return [...parts, part];
  return [...parts.slice(0, -1), part.length >= previous.length ? part : previous];
}

export function joinSpoken(parts: readonly string[]) {
  return parts.join('');
}
