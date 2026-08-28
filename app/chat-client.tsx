'use client';

import { FormEvent, useEffect, useRef, useState, type CSSProperties } from 'react';

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
  me: { id: string; displayName: string; role: string };
  messages: Message[];
};

type RecognitionEvent = { results: ArrayLike<{ 0: { transcript: string } }> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
};

type RecognitionConstructor = new () => Recognition;
type TextSize = 'standard' | 'large' | 'xlarge';

const textSizeLabels: Record<TextSize, string> = {
  standard: '標準',
  large: '大',
  xlarge: '特大',
};

async function fetchConversation() {
  let response = await fetch('/api/v1/messages', { cache: 'no-store' });

  if (response.status === 401) {
    const bootstrap = await fetch('/api/v1/dev/bootstrap', { method: 'POST' });
    if (bootstrap.ok) response = await fetch('/api/v1/messages', { cache: 'no-store' });
  }

  if (!response.ok) throw new Error('conversation_unavailable');
  return response.json() as Promise<ConversationPayload>;
}

export default function ChatClient() {
  const [conversation, setConversation] = useState<ConversationPayload | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(false);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [textSize, setTextSize] = useState<TextSize>('standard');
  const timelineEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConversation()
      .then(setConversation)
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem('family-chat-text-size');
    if (saved === 'standard' || saved === 'large' || saved === 'xlarge') setTextSize(saved);
  }, []);

  useEffect(() => {
    timelineEnd.current?.scrollIntoView({ block: 'end' });
  }, [conversation?.messages.length]);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

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

  function startVoiceInput() {
    const browserWindow = window as typeof window & {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };
    const SpeechRecognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      window.alert('このブラウザでは音声入力を利用できません。');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.interimResults = false;
    recognition.onresult = (event) => setDraft(event.results[0][0].transcript);
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  }

  function readAloud(text: string) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    window.speechSynthesis.speak(utterance);
  }

  function changeTextSize(next: TextSize) {
    setTextSize(next);
    window.localStorage.setItem('family-chat-text-size', next);
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
    return <main className="app-shell"><section className="state-card" role="status">家族のおしゃべりを開いています…</section></main>;
  }

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
        <header className="conversation-header">
          <div className="context-mark" aria-hidden="true">{conversation.space.name.slice(0, 1)}</div>
          <div>
            <p className="eyebrow">家族のおしゃべり</p>
            <h1 id="conversation-title">{conversation.space.name}</h1>
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
        </header>

        <div className="timeline" aria-label="家族の会話" aria-live="polite">
          <p className="date-divider"><span>今日</span></p>
          {conversation.messages.map((message) => {
            const mine = message.senderId === conversation.me.id;
            const time = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.createdAt));
            return (
              <article className={`message ${mine ? 'message-mine' : ''}`} key={message.id}>
                <div className="message-meta"><span className="message-avatar" style={{ background: message.avatarColor ?? '#3f7d61' }}>{message.avatarLabel ?? message.senderName.slice(0, 1)}</span><strong>{message.senderName}</strong><time dateTime={message.createdAt}>{time}</time></div>
                <div className="message-content">
                  <div className="message-bubble"><p>{message.text}</p></div>
                  <button className="read-aloud" type="button" onClick={() => readAloud(message.text)} aria-label={`${message.senderName}のメッセージを読み上げる`}>
                    <span className="speaker-glyph" aria-hidden="true">🔊</span>
                  </button>
                </div>
              </article>
            );
          })}
          <div ref={timelineEnd} />
        </div>

        <form className="composer" onSubmit={submitMessage}>
          <label className="sr-only" htmlFor="message">メッセージ</label>
          <textarea id="message" name="message" rows={2} maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="ここに書きます" />
          <div className="composer-actions">
            <button className="voice-button" type="button" onClick={startVoiceInput} disabled={listening}>
              <span aria-hidden="true">●</span>{listening ? '聞いています…' : '話して入力'}
            </button>
            <button className="send-button" type="submit" disabled={!draft.trim() || sending}>{sending ? '送信中' : '送る'}</button>
          </div>
        </form>
      </section>
    </main>
  );
}
