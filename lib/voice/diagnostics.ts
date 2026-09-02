'use client';

// 音声入力の不具合を、推測ではなく実物を見て直すための記録。
// 端末が実際に何を返してきたか(結果の並び・確定フラグ・resultIndex)と、
// それを受けてこちらがどう組み立てたかを残す。管理ツールからコピーできる。
const KEY = 'family-chat-voice-log';
const MAX_ENTRIES = 150;

export type VoiceLogEntry = {
  at: string;
  kind: 'start' | 'result' | 'end' | 'error';
  epoch?: number;
  session?: number;
  resultIndex?: number;
  results?: { final: boolean; text: string }[];
  text?: string;
  last?: string;
  total?: string;
  next?: string;
};

export function recordVoice(entry: Omit<VoiceLogEntry, 'at'>) {
  try {
    const raw = window.localStorage.getItem(KEY);
    const log = raw ? JSON.parse(raw) as VoiceLogEntry[] : [];
    log.push({ at: new Date().toISOString().slice(11, 23), ...entry });
    window.localStorage.setItem(KEY, JSON.stringify(log.slice(-MAX_ENTRIES)));
  } catch {
    // 記録できなくても本来の動作には影響させない。
  }
}

export function readVoiceLog() {
  try {
    return window.localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function clearVoiceLog() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // 消せなくても支障はない。
  }
}
