'use client';

import { Fragment, FormEvent, useEffect, useRef, useState, type CSSProperties } from 'react';
import QRCode from 'qrcode';
import { enableNotifications, getAppServiceWorker, getNotificationState, type NotificationState } from '@/lib/push/client';

type Message = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
  avatarLabel?: string;
  avatarColor?: string;
};

type ConversationPayload = {
  space: { id: string; name: string; settings: Record<string, unknown> };
  me: { id: string; displayName: string; role: string; metadata?: { avatarLabel?: string; avatarColor?: string; voiceDuration?: number; canInvite?: boolean } };
  admins?: string[];
  messages: Message[];
  hasMore: boolean;
};

type GroupMember = {
  id: string;
  displayName: string;
  role: string;
  avatarLabel?: string;
  avatarColor?: string;
  voiceDuration?: number;
};


// resultIndex は「この回で新しく届いた結果の開始位置」、isFinal は確定かどうか。
// どちらも Web Speech API の標準だが、この型定義には無かったので追加する。
type RecognitionEvent = { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionConstructor = new () => Recognition;
type TextSize = 'standard' | 'large' | 'xlarge';
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

const textSizeLabels: Record<TextSize, string> = {
  standard: '標準',
  large: '大',
  xlarge: '特大',
};
import { recoveryInstructionsPrompt, serverNameFromUrl } from '@/lib/text/update-instructions';
import { canReadAloud, copyText, readAloud, readStored, removeStored, writeStored } from '@/lib/browser/compat';
import { clearVoiceLog, readVoiceLog, recordVoice } from '@/lib/voice/diagnostics';
import { collapseResults, joinSpoken, mergeSpoken } from '@/lib/voice/merge';
import { PROFILE_COLORS as profileColors } from '@/lib/theme/colors';
import { tintWithWhite } from '@/lib/theme/tint';

// 設定の入口は誰でも同じ歯車ひとつ。管理できる人にだけ、その中身が深くなる。
function canManage(role: string) {
  return role === 'owner' || role === 'host';
}

class SetupRequiredError extends Error {}

// ログイン情報を失った端末に案内を出すため、ログインできているあいだに控えておく。
// サーバーに未認証で聞くと、URLを知っているだけの相手に管理者名を教えることになるので、
// 「以前ログインできていた端末の中」にだけ残す。
const RECOVERY_HINT_KEY = 'family-chat-recovery-hint';
type RecoveryHint = { spaceName: string; myName: string; isAdmin: boolean; adminNames: string[] };

// グループ名も利用者名も管理者が変更できるので、控えた情報は取れたぶんだけ毎回上書きする。
// 管理者名(admins)は初回と一定間隔でしか送られてこないため、無いときは前回の値を残す。
function saveRecoveryHint(payload: ConversationPayload) {
  const previous = readRecoveryHint();
  const adminNames = payload.admins ?? previous?.adminNames;
  if (!adminNames) return;
  const hint: RecoveryHint = {
    spaceName: payload.space.name,
    myName: payload.me.displayName,
    isAdmin: payload.me.role === 'owner' || payload.me.role === 'host',
    adminNames,
  };
  writeStored('local', RECOVERY_HINT_KEY, JSON.stringify(hint));
}

function readRecoveryHint(): RecoveryHint | null {
  try {
    const raw = readStored('local', RECOVERY_HINT_KEY);
    return raw ? JSON.parse(raw) as RecoveryHint : null;
  } catch { return null; }
}
// 通信の一時的な失敗と、ログイン情報が失われて二度と自力では戻れない状態とを区別する。
class LockedOutError extends Error {}

// 定期更新は常に最新50件だけを取り直す。その範囲より古い(「もっと見る」で読み込んだ)
// 履歴はそのままに、範囲内だけを新しい結果で置き換える — 削除や編集もここで反映される。
function mergeLatestMessages(current: Message[], latest: Message[]): Message[] {
  if (latest.length === 0) return current;
  const windowStart = latest[0].createdAt;
  const olderHistory = current.filter((message) => message.createdAt < windowStart);
  return [...olderHistory, ...latest];
}

function prependOlderMessages(current: Message[], older: Message[]): Message[] {
  const existingIds = new Set(current.map((message) => message.id));
  const newOnes = older.filter((message) => !existingIds.has(message.id));
  return [...newOnes, ...current];
}

async function fetchConversation(withAdmins = false) {
  const query = withAdmins ? '?withAdmins=1' : '';
  const response = await fetch(`/api/v1/messages${query}`, { cache: 'no-store' });

  if (response.status === 401) {
    const setupState = await fetch('/api/v1/setup', { cache: 'no-store' }).then((r) => r.json()).catch(() => null) as { needsSetup?: boolean } | null;
    if (setupState?.needsSetup) throw new SetupRequiredError();
    throw new LockedOutError();
  }

  if (!response.ok) throw new Error('conversation_unavailable');
  const payload = await response.json() as ConversationPayload;

  // グループが分かったら、以後はそのグループ専用のセッションに揃える。
  // 端末に古い共通セッションが残っていると、画面上の自分と操作時の自分が食い違うため。
  return payload;
}

export default function ChatClient() {
  const [conversation, setConversation] = useState<ConversationPayload | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(false);
  // true は「締め出されたが、誰に頼めばいいかまでは分からない」状態。
  const [lockedOut, setLockedOut] = useState<RecoveryHint | true | null>(null);
  // 読み上げ非対応の端末では、押しても何も起きないボタンを出さない。
  const [speechSupported, setSpeechSupported] = useState(false);
  // 控えが消えていると誰が見ているのか判別できないので、そのときだけ管理者向けを出し分ける。
  const [showAdminRecovery, setShowAdminRecovery] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupOwnerName, setSetupOwnerName] = useState('');
  const [setupGroupName, setSetupGroupName] = useState('');
  const [setupIcon, setSetupIcon] = useState('🏡');
  const [setupColor, setSetupColor] = useState(profileColors[0]);
  const [settingUp, setSettingUp] = useState(false);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [textSize, setTextSize] = useState<TextSize>('standard');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [personalName, setPersonalName] = useState('');
  const [personalAvatar, setPersonalAvatar] = useState('');
  const [personalColor, setPersonalColor] = useState(profileColors[0]);
  const [personalDuration, setPersonalDuration] = useState(0);
  const [notificationStatus, setNotificationStatus] = useState<NotificationState>('default');
  const [savingPersonalProfile, setSavingPersonalProfile] = useState(false);
  const [installGuide, setInstallGuide] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [deviceUrl, setDeviceUrl] = useState('');
  const [deviceExpiresAt, setDeviceExpiresAt] = useState('');
  const [deviceQr, setDeviceQr] = useState('');
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteExpiresAt, setInviteExpiresAt] = useState('');
  const [inviteQr, setInviteQr] = useState('');
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const timelineEnd = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const settingsPanelRef = useRef<HTMLElement>(null);
  const pendingScrollAdjustRef = useRef<{ prevScrollHeight: number; prevScrollTop: number } | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const voiceTimerRef = useRef<number | null>(null);
  const voiceManualStopRef = useRef(false);
  // 確定した発話の並び。セッションをまたいで貯める。
  const voiceSegmentsRef = useRef<string[]>([]);
  // 音声入力を始めた時点で入力欄にあった文。認識結果はこの後ろに足すだけで、
  // ここは書き換えない(手で消した部分が復活しないように)。
  const voicePrefixRef = useRef('');
  // onend が来ない端末でも送信できるようにするための保険。
  const voiceSubmitFallbackRef = useRef<number | null>(null);
  // キーボードで直したあと、認識結果を一切受け付けないための印。
  // stop() しても onend が来ない端末では、止めたつもりでも結果が届き続けるため。
  const voiceDiscardRef = useRef(false);
  // 聞き取りの「世代」。開始のたびに増やし、この番号が一致する回だけが書き込める。
  // 前回の認識が終了しきらずに残っていても、古い世代は何もできなくなる。
  const voiceEpochRef = useRef(0);
  const voicePendingSubmitRef = useRef(false);
  const draftRef = useRef('');
  const conversationRef = useRef<ConversationPayload | null>(null);
  draftRef.current = draft;
  conversationRef.current = conversation;

  useEffect(() => {
    fetchConversation(true)
      .then((data) => {
        saveRecoveryHint(data);
        setConversation(data);
        setPersonalName(data.me.displayName);
        setPersonalAvatar(data.me.metadata?.avatarLabel ?? data.me.displayName.slice(0, 1));
        setPersonalColor(data.me.metadata?.avatarColor ?? profileColors[0]);
        const savedDuration = Number(data.me.metadata?.voiceDuration);
        const groupDuration = Number((data.space.settings.policy as { voiceDuration?: unknown } | undefined)?.voiceDuration);
        setPersonalDuration(savedDuration === 15 || savedDuration === 30 || savedDuration === 60 ? savedDuration : groupDuration === 15 || groupDuration === 30 || groupDuration === 60 ? groupDuration : 30);
        setHasMoreOlder(data.hasMore);
      })
      .catch((thrown) => {
        if (thrown instanceof SetupRequiredError) setNeedsSetup(true);
        else if (thrown instanceof LockedOutError) setLockedOut(readRecoveryHint() ?? true);
        else setError(true);
      });
  }, []);

  useEffect(() => {
    if (!conversation) return;
    let refreshTimer: number | null = null;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      fetchConversation()
        .then((next) => {
          if (next.space.id !== conversation.space.id) return;
          // グループ名と自分の名前はポーリングで毎回届くので、控えもついでに直しておく。
          // 管理者名はアプリを開き直したときに取り直せば十分(400日先のための案内なので)。
          saveRecoveryHint(next);
          setConversation((current) => current ? { ...current, messages: mergeLatestMessages(current.messages, next.messages), space: next.space, me: next.me } : next);
        })
        .catch(() => undefined);
    };
    const stopTimer = () => {
      if (refreshTimer !== null) window.clearInterval(refreshTimer);
      refreshTimer = null;
    };
    const startTimer = () => {
      stopTimer();
      if (document.visibilityState === 'visible') refreshTimer = window.setInterval(refresh, 15000);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
      startTimer();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', refresh);
    startTimer();
    return () => {
      stopTimer();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', refresh);
    };
  }, [conversation?.space.id]);

  useEffect(() => {
    setSpeechSupported(canReadAloud());
  }, []);

  useEffect(() => {
    const saved = readStored('local', 'family-chat-text-size');
    if (saved === 'standard' || saved === 'large' || saved === 'xlarge') setTextSize(saved);
  }, []);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    if (standalone) return;
    if (conversation && readStored('session', 'pdh-install-guide') === '1') setInstallGuide(true);
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      removeStored('session', 'pdh-install-guide');
      setInstallGuide(false);
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [conversation?.space.id]);

  useEffect(() => {
    if (!conversation) return;
    // manifestは layout.tsx がHTMLに書き出しているので、ここでは触らない。
    getAppServiceWorker().catch(() => undefined);
  }, [conversation?.space.id]);

  useEffect(() => {
    if (conversation) getNotificationState().then(setNotificationStatus).catch(() => setNotificationStatus('default'));
  }, [conversation?.space.id]);

  useEffect(() => {
    if (deviceUrl) QRCode.toDataURL(deviceUrl, { margin: 1, width: 180 }).then(setDeviceQr).catch(() => setDeviceQr(''));
    else setDeviceQr('');
  }, [deviceUrl]);

  useEffect(() => {
    if (inviteUrl) QRCode.toDataURL(inviteUrl, { margin: 1, width: 180 }).then(setInviteQr).catch(() => setInviteQr(''));
    else setInviteQr('');
  }, [inviteUrl]);

  // 設定は同じページの中で開く。履歴に積んでおくと、端末の戻る操作でそのまま閉じられる。
  useEffect(() => {
    if (!settingsOpen) return;
    window.history.pushState({ pdhSettings: true }, '', `${window.location.pathname}#settings`);
    const handlePopState = () => setSettingsOpen(false);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (window.location.hash === '#settings') window.history.back();
    };
  }, [settingsOpen]);

  // 設定パネルの外(会話画面側)をクリックしたら閉じる。
  useEffect(() => {
    if (!settingsOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('.personal-menu-button')) return;
      if (settingsPanelRef.current && !settingsPanelRef.current.contains(target)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [settingsOpen]);

  // メンバー一覧は全員が見られるので、設定を開いたときに取りに行く。
  // 自分の設定側の表示も、開くたびにこのレスポンス(DBを直接読む、最新の値)
  // へ合わせ直す。conversation.meはポーリング頼りで最新とは限らないため、
  // conversation.meからではなく、ここで取得した自分自身のメンバー情報を使う。
  useEffect(() => {
    if (!settingsOpen || !conversation) return;
    fetch('/api/v1/manage/overview', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<{ members: GroupMember[] }> : null)
      .then((data) => {
        const list = data?.members ?? [];
        setMembers(list);
        const me = list.find((member) => member.id === conversation.me.id);
        if (me) {
          setPersonalName(me.displayName);
          setPersonalAvatar(me.avatarLabel ?? me.displayName.slice(0, 1));
          setPersonalColor(me.avatarColor ?? profileColors[0]);
          const savedDuration = Number(me.voiceDuration);
          setPersonalDuration(savedDuration === 15 || savedDuration === 30 || savedDuration === 60 ? savedDuration : 30);
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen, conversation?.space.id]);

  useEffect(() => {
    const pending = pendingScrollAdjustRef.current;
    if (pending && timelineRef.current) {
      // 上に読み込んだ分だけ、見ていた位置がずれないようスクロールを補正する。
      const newScrollHeight = timelineRef.current.scrollHeight;
      timelineRef.current.scrollTop = pending.prevScrollTop + (newScrollHeight - pending.prevScrollHeight);
      pendingScrollAdjustRef.current = null;
      return;
    }
    timelineEnd.current?.scrollIntoView({ block: 'end' });
  }, [conversation?.messages.length]);

  async function loadOlderMessages() {
    if (!conversation || loadingOlder || !hasMoreOlder) return;
    const oldest = conversation.messages[0]?.createdAt;
    if (!oldest) return;
    setLoadingOlder(true);
    const params = new URLSearchParams({ before: oldest });
    const response = await fetch(`/api/v1/messages?${params.toString()}`, { cache: 'no-store' }).catch(() => null);
    setLoadingOlder(false);
    if (!response?.ok) return;
    const data = await response.json() as ConversationPayload;
    setHasMoreOlder(data.hasMore);
    if (timelineRef.current) {
      pendingScrollAdjustRef.current = { prevScrollHeight: timelineRef.current.scrollHeight, prevScrollTop: timelineRef.current.scrollTop };
    }
    setConversation((current) => current ? { ...current, messages: prependOlderMessages(current.messages, data.messages) } : current);
  }

  async function submitSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ownerName = setupOwnerName.trim();
    const groupNameInput = setupGroupName.trim();
    if (!ownerName || !groupNameInput || settingUp) return;
    setSettingUp(true);
    const response = await fetch('/api/v1/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerName, groupName: groupNameInput, icon: setupIcon.trim() || '🏡', color: setupColor }),
    }).catch(() => null);
    if (!response?.ok) {
      setSettingUp(false);
      window.alert('作れませんでした。少し待ってもう一度お試しください。');
      return;
    }
    window.location.href = '/';
  }

  async function sendMessageText(text: string) {
    recordVoice({ kind: 'submit', note: 'sendMessageText', text });
    if (!text) {
      setSending(false);
      return;
    }
    setSending(true);
    const response = await fetch('/api/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).catch(() => null);

    if (!response?.ok) {
      setError(true);
      setSending(false);
      return;
    }

    const result = await response.json() as { message: Message };
    setConversation((current) => current ? {
      ...current,
      messages: [...current.messages, result.message],
    } : current);
    setDraft('');
    setSending(false);
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (listening) {
      // マイクを止めた直後の確定結果はまだ届いていないことがあるので、
      // ここでは即座に送信せず、認識が完全に終わってから(onendで)送る。
      voicePendingSubmitRef.current = true;
      recordVoice({ kind: 'submit', note: 'submit pressed while listening', text: draftRef.current });
      setSending(true);
      stopVoiceInput();
      // onend が来ないまま止まる端末があるので、少し待って届かなければそのまま送る。
      voiceSubmitFallbackRef.current = window.setTimeout(() => flushPendingSubmit('timeout'), 700);
      return;
    }
    if (sending) return;
    await sendMessageText(draft.trim());
  }

  // 聞き取り中に「送る」を押したときの送信。確定結果を待ちたいので onend で呼ぶが、
  // onend が来ない端末(macOS)があるため、時間切れでも同じ処理を通す。
  function flushPendingSubmit(from: string) {
    recordVoice({ kind: 'submit', note: `flush:${from} pending=${voicePendingSubmitRef.current}`, text: draftRef.current });
    if (!voicePendingSubmitRef.current) return;
    voicePendingSubmitRef.current = false;
    if (voiceSubmitFallbackRef.current !== null) {
      window.clearTimeout(voiceSubmitFallbackRef.current);
      voiceSubmitFallbackRef.current = null;
    }
    void sendMessageText(draftRef.current.trim());
  }

  function stopVoiceInput() {
    recordVoice({ kind: 'stop', note: `pendingSubmit=${voicePendingSubmitRef.current} listening=${listening}` });
    // 記録をサーバーへ送る(管理者のときだけ受け付けられる)。原因が分かったら外す。
    // 止めた直後に起きること(onend・時間切れ・送信)まで含めたいので、少し待ってから送る。
    window.setTimeout(() => {
      const log = readVoiceLog();
      if (log) {
        fetch('/api/v1/voice-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: log }).catch(() => undefined);
      }
    }, 1200);
    voiceManualStopRef.current = true;
    if (voiceTimerRef.current !== null) window.clearTimeout(voiceTimerRef.current);
    voiceTimerRef.current = null;
    recognitionRef.current?.stop();
    setListening(false);
  }

  function startVoiceInput() {
    if (listening) {
      stopVoiceInput();
      return;
    }
    const browserWindow = window as typeof window & {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };
    const SpeechRecognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      window.alert('このブラウザでは音声入力を利用できません。');
      return;
    }

    // 前回の聞き取りが残っている可能性があるので、ここで世代を進めて無効化する。
    const epoch = voiceEpochRef.current + 1;
    voiceEpochRef.current = epoch;
    try { recognitionRef.current?.stop(); } catch { /* 既に止まっていても構わない */ }
    recognitionRef.current = null;

    voiceManualStopRef.current = false;
    voiceSegmentsRef.current = [];
    voicePrefixRef.current = draftRef.current;
    voiceDiscardRef.current = false;
    clearVoiceLog();
    recordVoice({ kind: 'start', epoch });
    setListening(true);

    // 一部の端末(古いAndroid WebViewなど)は無音を検知すると、指定時間より
    // かなり早くセッションを打ち切ってしまう。手動停止やタイマー満了でなければ
    // それまでの文章を保ったまま自動的に聞き取りを再開し、実質的な聞き取り
    // 時間が短くなりすぎないようにする。
    let sessionCount = 0;
    const beginSession = () => {
      if (voiceEpochRef.current !== epoch) return;
      const session = ++sessionCount;
      // このセッションが認識した文の全体。届くたびに組み直して置き換える。
      let sessionText = '';
      const recognition = new SpeechRecognition();
      recognition.lang = 'ja-JP';
      recognition.continuous = true;
      recognition.interimResults = false;
      // 端末によって、認識結果の返し方が大きく違う。
      //   (1) 発話の切れ目ごとにセッションを切り、そのたびに「最初からの全文」を返す端末
      //   (2) セッション内で結果を累積して返す端末
      //   (3) 今回確定した分だけを返す端末
      // セッション単位で足していくと(1)で全文が何度も積み重なって暴走するため、
      // 全体を1本の文として扱い、届いた文が既に持っている文の続きなら差し替える。
      recognition.onresult = (event) => {
        // 既に次のセッションへ切り替わっている場合、古いセッションから遅れて届いた結果は
        // 捨てる。拾ってしまうと、同じ発話がもう一度足されて文が重複する。
        if (voiceDiscardRef.current) return;
        if (voiceEpochRef.current !== epoch || recognitionRef.current !== recognition) return;
        const finals: string[] = [];
        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (result.isFinal) finals.push(result[0].transcript);
        }
        const text = collapseResults(finals);
        if (!text) return;
        // このセッションの文を、確定済みの並びへ同じ規則で重ねて表示する。
        sessionText = text;
        const next = voicePrefixRef.current + joinSpoken(mergeSpoken(voiceSegmentsRef.current, sessionText));
        recordVoice({
          kind: 'result', epoch, session,
          resultIndex: event.resultIndex,
          results: Array.from(event.results as ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>,
            (result) => ({ final: Boolean(result.isFinal), text: result[0].transcript })),
          text, total: voicePrefixRef.current + joinSpoken(voiceSegmentsRef.current), next,
        });
        setDraft(next);
      };
      recognition.onerror = (event) => {
        recordVoice({ kind: 'error', epoch, session, note: String(event?.error ?? '') });
        stopVoiceInput();
      };
      recognition.onend = () => {
        recordVoice({ kind: 'end', epoch, session, text: sessionText });
        if (voiceEpochRef.current !== epoch || recognitionRef.current !== recognition) return;
        recognitionRef.current = null;
        // セッション分を確定させる。次のセッションが同じ発話の続きを返してきた場合は、
        // ここで足さずに置き換わる(判定は結果配列のときと同じ)。
        voiceSegmentsRef.current = mergeSpoken(voiceSegmentsRef.current, sessionText);
        // 蓄積は onresult の時点で確定済みなので、ここで詰め直すものは無い。
        if (!voiceManualStopRef.current) {
          beginSession();
          return;
        }
        voiceSegmentsRef.current = [];
        flushPendingSubmit('onend');
      };
      recognitionRef.current = recognition;
      recognition.start();
    };
    beginSession();

    const configuredDuration = Number((conversation?.space.settings.policy as { voiceDuration?: unknown } | undefined)?.voiceDuration);
    const duration = personalDuration || (configuredDuration === 15 || configuredDuration === 30 || configuredDuration === 60 ? configuredDuration : 30);
    voiceTimerRef.current = window.setTimeout(stopVoiceInput, duration * 1000);
  }

  function changeTextSize(next: TextSize) {
    setTextSize(next);
    writeStored('local', 'family-chat-text-size', next);
  }

  async function requestNotifications() {
    if (!conversation) return;
    try {
      setNotificationStatus(await enableNotifications());
    } catch {
      window.alert('通知を登録できませんでした。少し待ってもう一度お試しください。');
    }
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      removeStored('session', 'pdh-install-guide');
      setInstallGuide(false);
    }
    setInstallPrompt(null);
  }

  async function savePersonalProfile() {
    const name = personalName.trim();
    if (!name) {
      window.alert('名前を入力してください。');
      return;
    }
    setSavingPersonalProfile(true);
    const response = await fetch('/api/v1/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: name, avatarLabel: personalAvatar, avatarColor: personalColor, voiceDuration: personalDuration }) }).catch(() => null);
    if (!response?.ok) {
      setSavingPersonalProfile(false);
      window.alert('名前は40文字以内、アイコンは1つの文字で設定してください。');
      return;
    }
    setConversation((current) => current ? { ...current, me: { ...current.me, displayName: name, metadata: { ...current.me.metadata, avatarLabel: personalAvatar, avatarColor: personalColor, voiceDuration: personalDuration } }, messages: current.messages.map((message) => message.senderId === current.me.id ? { ...message, senderName: name, avatarLabel: personalAvatar, avatarColor: personalColor } : message) } : current);
    setMembers((current) => current.map((member) => member.id === conversation?.me.id ? { ...member, displayName: name, avatarLabel: personalAvatar, avatarColor: personalColor, voiceDuration: personalDuration } : member));
    setSavingPersonalProfile(false);
  }

  async function createDeviceLink() {
    if (!conversation) return;
    const response = await fetch('/api/v1/device-links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).catch(() => null);
    if (!response?.ok) { window.alert('接続リンクを作れませんでした。'); return; }
    const result = await response.json() as { deviceUrl: string; expiresAt: string };
    setDeviceUrl(result.deviceUrl);
    setDeviceExpiresAt(result.expiresAt);
  }

  async function createInvite() {
    if (!conversation) return;
    const response = await fetch('/api/v1/manage/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => null);
    if (!response?.ok) {
      window.alert(response?.status === 409 ? 'さきに名前とアイコンを保存してください。' : '招待リンクを作れませんでした。');
      return;
    }
    const result = await response.json() as { inviteUrl: string; expiresAt: string };
    setInviteUrl(result.inviteUrl);
    setInviteExpiresAt(result.expiresAt);
  }

  async function deleteMessage(messageId: string) {
    if (!conversation) return;
    setConfirmDeleteId(null);
    const response = await fetch(`/api/v1/messages?messageId=${encodeURIComponent(messageId)}`, { method: 'DELETE' }).catch(() => null);
    if (!response?.ok) {
      window.alert('1日を過ぎたか、すでに削除されています。');
      return;
    }
    if (timelineRef.current) {
      pendingScrollAdjustRef.current = { prevScrollHeight: timelineRef.current.scrollHeight, prevScrollTop: timelineRef.current.scrollTop };
    }
    setConversation((current) => current ? { ...current, messages: current.messages.filter((message) => message.id !== messageId) } : current);
  }

  function dateKey(value: string) {
    const date = new Date(value);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  function dateLabel(value: string) {
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (dateKey(value) === dateKey(today.toISOString())) return '今日';
    if (dateKey(value) === dateKey(yesterday.toISOString())) return '昨日';
    return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
  }

  if (needsSetup) {
    return (
      <main className="app-shell">
        <section className="state-card setup-card">
          <h1>はじめまして</h1>
          <p>あなたの名前と、家族グループの名前を決めてください。</p>
          <form onSubmit={submitSetup}>
            <label>あなたの名前<input value={setupOwnerName} maxLength={40} onChange={(event) => setSetupOwnerName(event.target.value)} placeholder="例：お母さん" /></label>
            <label>グループの名前<input value={setupGroupName} maxLength={40} onChange={(event) => setSetupGroupName(event.target.value)} placeholder="例：実家" /></label>
            <div className="setup-icon-row">
              <div className="setup-icon-preview" aria-hidden="true" style={{ background: setupColor }}>{setupIcon || '🏡'}</div>
              <label>アイコン<input value={setupIcon} maxLength={8} onChange={(event) => setSetupIcon(event.target.value)} placeholder="例：🏠" /></label>
            </div>
            <div className="personal-color-options" aria-label="アプリの色">
              {profileColors.map((color) => <button key={color} type="button" aria-label={color} className={color === setupColor ? 'is-selected' : ''} style={{ background: color }} onClick={() => setSetupColor(color)} />)}
              <span className="color-picker-wrap"><input type="color" aria-label="色を自由に選ぶ" value={setupColor} onChange={(event) => setSetupColor(event.target.value)} /></span>
            </div>
            <button type="submit" disabled={!setupOwnerName.trim() || !setupGroupName.trim() || settingUp}>{settingUp ? '作っています…' : 'はじめる'}</button>
          </form>
        </section>
      </main>
    );
  }

  if (lockedOut) {
    const hint = lockedOut === true ? null : lockedOut;
    // 端末が「自分は管理者だった」と覚えている場合だけ、Cloudflareでの復旧手順を出す。
    // それ以外は、誰に何を頼めばいいかだけを伝える。
    if (hint?.isAdmin) {
      const appUrl = window.location.origin;
      const prompt = recoveryInstructionsPrompt(appUrl);
      const serverName = serverNameFromUrl(appUrl);
      return (
        <main className="app-shell">
          <section className="state-card" role="alert">
            <h1>この端末のログイン情報が消えています</h1>
            <p>Cloudflareにログインして、「{serverName}」を復旧してください。</p>
            <p>AIに指示して行うことができます。</p>
            <p className="admin-prompt-label">AI用プロンプト</p>
            <p className="admin-prompt-text">{prompt}</p>
            <button type="button" onClick={() => copyText(prompt)}>コピー</button>
          </section>
        </main>
      );
    }
    const adminName = hint?.adminNames[0];
    if (hint && adminName) {
      return (
        <main className="app-shell">
          <section className="state-card" role="alert">
            <h1>この端末のログイン情報が消えています</h1>
            <p>「{hint.spaceName}」の管理者「{adminName}」さんに、ユーザー名「{hint.myName}」のログイン用のリンクをもらってください。</p>
          </section>
        </main>
      );
    }
    // 端末に控えが残っていない場合(iOSが保存領域を消したときなど)。見ているのが家族か
    // 管理者か分からないので、家族向けを既定にして、管理者向けは一段奥に置く。
    const appUrl = window.location.origin;
    const prompt = recoveryInstructionsPrompt(appUrl);
    const serverName = serverNameFromUrl(appUrl);
    return (
      <main className="app-shell">
        <section className="state-card" role="alert">
          <h1>この端末のログイン情報が消えています</h1>
          <p>グループの管理者に、ログイン用のリンクをもらってください。</p>
          {showAdminRecovery ? (
            <>
              <hr className="settings-divider" />
              <p>Cloudflareにログインして、「{serverName}」を復旧してください。</p>
              <p>AIに指示して行うことができます。</p>
              <p className="admin-prompt-label">AI用プロンプト</p>
              <p className="admin-prompt-text">{prompt}</p>
              <button type="button" onClick={() => copyText(prompt)}>コピー</button>
            </>
          ) : (
            <button type="button" onClick={() => setShowAdminRecovery(true)}>あなたが管理者の場合</button>
          )}
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="app-shell">
        <section className="state-card" role="alert">
          <h1>おしゃべりを開けませんでした</h1>
          <p>少し待ってから、もう一度開いてください。</p>
          <button type="button" onClick={() => window.location.reload()}>もう一度</button>
        </section>
      </main>
    );
  }

  if (!conversation) {
    return <main className="app-shell app-shell-loading" role="status"><p className="loading-text">家族のおしゃべりを開いています…</p></main>;
  }

  const appProfile = (conversation.space.settings.appProfile ?? {}) as { icon?: string };
  const theme = (conversation.space.settings.theme ?? {}) as {
    primaryColor?: string;
    accentColor?: string;
    backgroundColor?: string;
  };
  const conversationStyle = {
    '--context-primary': theme.primaryColor ?? '#2f6b4f',
    '--context-strong': theme.primaryColor ?? '#1f4e39',
    '--context-soft': theme.accentColor ?? '#e6f1ea',
    '--context-pale': theme.backgroundColor ?? '#f4f8f5',
  } as CSSProperties;

  return (
    <main className="app-shell" style={conversationStyle}>
      <section className={`conversation text-size-${textSize}`} aria-labelledby="conversation-title">
        {installGuide && <aside className="install-guide" aria-label="アプリをホーム画面に追加"><div><strong>{conversation.space.name}をアプリにします</strong><small>{installPrompt ? 'このグループ専用のアイコンを追加します。' : 'Chromeの右上の「⋮」から「ホーム画面に追加」を選べます。'}</small></div>{installPrompt && <button type="button" onClick={installApp}>ホーム画面に追加</button>}<button className="install-guide-close" type="button" aria-label="閉じる" onClick={() => setInstallGuide(false)}>×</button></aside>}
        <header className="conversation-header">
          <div>
            <p className="eyebrow">家族のおしゃべり</p>
            <h1 id="conversation-title">{appProfile.icon && <span className="header-icon" aria-hidden="true">{appProfile.icon}</span>}{conversation.space.name}</h1>
          </div>
          <div className="text-size-control" role="group" aria-label="文字の大きさ">
            {(Object.keys(textSizeLabels) as TextSize[]).map((size) => (
              <button
                key={size}
                type="button"
                className={textSize === size ? 'is-active' : ''}
                aria-pressed={textSize === size}
                onClick={() => changeTextSize(size)}
              >
                {textSizeLabels[size]}
              </button>
            ))}
          </div>
          <button className="personal-menu-button" type="button" aria-label="設定" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65-2-3.46-2.49 1a7.2 7.2 0 0 0-1.69-.98L15 3h-4l-.36 2.93c-.6.25-1.16.58-1.69.98l-2.49-1-2 3.46 2.11 1.65c-.04.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65 2 3.46 2.49-1c.53.4 1.09.73 1.69.98L11 21h4l.36-2.93c.6-.25 1.16-.58 1.69-.98l2.49 1 2.11-3.46-2.11-1.65ZM13 15.5A3.5 3.5 0 1 1 13 8a3.5 3.5 0 0 1 0 7.5Z" /></svg></button>
        </header>

        {settingsOpen && <section className="settings-panel" aria-label="設定" ref={settingsPanelRef}>
          <div className="settings-panel-topbar">
            <button className="personal-settings-close" type="button" aria-label="閉じる" onClick={() => setSettingsOpen(false)}>×</button>
          </div>
          <div className="settings-panel-body">
          <div className="personal-settings-main">
            <div className="settings-heading">
              <div className="setup-icon-preview" aria-hidden="true" style={{ background: personalColor }}>{personalAvatar || conversation.me.displayName.slice(0, 1)}</div>
              <strong>自分の設定</strong>
            </div>
            <div className="settings-row">
              <label>名前<input className="wide-input" value={personalName} maxLength={40} onChange={(event) => setPersonalName(event.target.value)} /></label>
            </div>
            <div className="settings-row">
              <label>アイコン<input value={personalAvatar} maxLength={20} onChange={(event) => setPersonalAvatar(event.target.value)} /></label>
              <div className="personal-color-options" aria-label="自分の色">
                {profileColors.map((color) => <button key={color} type="button" aria-label={color} className={color === personalColor ? 'is-selected' : ''} style={{ background: color }} onClick={() => setPersonalColor(color)} />)}
                <span className="color-picker-wrap"><input type="color" aria-label="色を自由に選ぶ" value={personalColor} onChange={(event) => setPersonalColor(event.target.value)} /></span>
              </div>
            </div>
            <div className="settings-row">
              {((conversation.space.settings.policy ?? {}) as { allowAudio?: boolean }).allowAudio !== false && <label>話す時間<select value={personalDuration} onChange={(event) => setPersonalDuration(Number(event.target.value))}><option value={15}>15秒</option><option value={30}>30秒</option><option value={60}>60秒</option></select></label>}
              <button className="personal-save" type="button" onClick={savePersonalProfile} disabled={savingPersonalProfile}>{savingPersonalProfile ? '保存中…' : '保存'}</button>
            </div>
            <hr className="settings-divider" />
            <div className="settings-row settings-row-right">
              <button className="personal-notification" type="button" onClick={requestNotifications} disabled={notificationStatus === 'unsupported' || notificationStatus === 'granted' || notificationStatus === 'denied'}>{notificationStatus === 'granted' ? '通知を許可済み' : notificationStatus === 'denied' ? '通知は未許可' : notificationStatus === 'unsupported' ? '通知に非対応' : '通知を許可'}</button>
              <button className="device-link-toggle" type="button" onClick={() => (deviceUrl ? setDeviceUrl('') : createDeviceLink())}>{deviceUrl ? '閉じる' : '別の端末でも使う'}</button>
            </div>
            {deviceUrl && <div className="expandable-panel">
              <small>{new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(deviceExpiresAt))}まで</small>
              <p>{deviceUrl}</p>
              <button type="button" onClick={() => copyText(deviceUrl)}>リンクをコピー</button>
              {deviceQr && <img src={deviceQr} alt="別の端末をつなぐQRコード" />}
            </div>}
          </div>

          <div className="member-setting">
            <div className="member-setting-header">
              <strong>メンバー</strong>
              {(canManage(conversation.me.role) || conversation.me.metadata?.canInvite === true) && <button type="button" onClick={() => (inviteUrl ? setInviteUrl('') : createInvite())}>{inviteUrl ? '閉じる' : 'メンバーを追加'}</button>}
            </div>
            {inviteUrl && <div className="expandable-panel">
              <small>{new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(inviteExpiresAt))}まで</small>
              <p>{inviteUrl}</p>
              <button type="button" onClick={() => copyText(inviteUrl)}>リンクをコピー</button>
              {inviteQr && <img src={inviteQr} alt="家族を招待するQRコード" />}
            </div>}
            <hr className="settings-divider" />
            <ul>
              {members.map((member) => (
                <li key={member.id}>
                  <span className="message-avatar" style={{ background: member.avatarColor ?? '#3f7d61' }}>{member.avatarLabel ?? member.displayName.slice(0, 1)}</span>
                  <span className="member-name">{member.displayName}{member.role === 'owner' && '（管理者）'}</span>
                </li>
              ))}
            </ul>
            {canManage(conversation.me.role) && <div className="admin-links-setting">
              <a className="admin-tool-link" href="/admin">管理ツールを開く</a>
            </div>}
          </div>
          </div>
        </section>}

        <div className="timeline" aria-label="家族の会話" aria-live="polite" ref={timelineRef}>
          {hasMoreOlder && <button type="button" className="load-more" onClick={loadOlderMessages} disabled={loadingOlder}>{loadingOlder ? '読み込んでいます…' : 'もっと見る'}</button>}
          {conversation.messages.map((message, index) => {
            const mine = message.senderId === conversation.me.id;
            const time = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.createdAt));
            const canDelete = canManage(conversation.me.role) || (mine && Date.now() - new Date(message.createdAt).getTime() <= 24 * 60 * 60 * 1000);
            const bubbleColor = message.avatarColor ?? '#3f7d61';
            return (
              <Fragment key={message.id}>
                {(index === 0 || dateKey(conversation.messages[index - 1].createdAt) !== dateKey(message.createdAt)) && <p className="date-divider"><span>{dateLabel(message.createdAt)}</span></p>}
                <article className={`message ${mine ? 'message-mine' : ''}`}>
                <div className="message-meta"><span className="message-avatar" style={{ background: bubbleColor }}>{message.avatarLabel ?? message.senderName.slice(0, 1)}</span><strong>{message.senderName}</strong><time dateTime={message.createdAt}>{time}</time>{canDelete && (confirmDeleteId === message.id
                  ? <span className="message-confirm">
                      <button type="button" className="confirm-danger" onClick={() => deleteMessage(message.id)}>消す</button>
                      <button type="button" className="confirm-safe" onClick={() => setConfirmDeleteId(null)}>残す</button>
                    </span>
                  : <button className="message-delete" type="button" aria-label="この発言を削除" onClick={() => setConfirmDeleteId(message.id)}>×</button>)}</div>
                <div className="message-content">
                  <div className="message-bubble" style={{ background: tintWithWhite(bubbleColor, 10) }}><p>{message.text}</p></div>
                  {speechSupported && <button className="read-aloud" type="button" onClick={() => readAloud(message.text)} aria-label={`${message.senderName}のメッセージを読み上げる`}>
                    <svg className="speaker-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z" /><path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10" /></svg>
                  </button>}
                </div>
                </article>
              </Fragment>
            );
          })}
          <div ref={timelineEnd} />
        </div>

        <form className={`composer${listening ? ' listening' : ''}`} onSubmit={submitMessage}>
          <label className="sr-only" htmlFor="message">メッセージ</label>
          <textarea id="message" name="message" rows={2} maxLength={2000} value={draft} onChange={(event) => { setDraft(event.target.value); if (listening) { voiceDiscardRef.current = true; stopVoiceInput(); } }} placeholder="ここに書きます" />
          <div className="composer-actions">
            {((conversation.space.settings.policy ?? {}) as { allowAudio?: boolean }).allowAudio !== false && <button className={`voice-button${listening ? ' listening' : ''}`} type="button" onClick={startVoiceInput}>
              <span className="voice-dot" aria-hidden="true">●</span>{listening ? '聞き取り中…' : '話して入力'}
            </button>}
            <button className="send-button" type="submit" disabled={(!listening && !draft.trim()) || sending}>{sending ? '送信中' : '送る'}</button>
          </div>
        </form>
      </section>
    </main>
  );
}
