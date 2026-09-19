"use client";

import { Download, FileText, LoaderCircle, MessageCircle, Paperclip, Send, X } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import type { ChatAttachmentPayload, ChatMessage, PlayerSession } from "@/lib/auction/types";

const CHAT_POLL_MS = 1_200;
const MAX_FILE_BYTES = 2_000_000;
const MAX_TOTAL_BYTES = 2_500_000;
const MAX_FILES = 3;
const ACCEPTED = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.webp";

async function chatRequest<T>(path: string, session: PlayerSession, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      "x-bidarena-player": session.playerId,
      "x-bidarena-token": session.token,
      ...init.headers,
    },
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Room chat request failed.");
  return payload;
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 32_768;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunk, bytes.length)));
  }
  return btoa(binary);
}

export function RoomChat({ session }: { session: PlayerSession }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const knownMessageRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      try {
        const payload = await chatRequest<{ messages: ChatMessage[] }>(`/api/rooms/${session.roomCode}/chat`, session);
        if (cancelled) return;
        const newest = payload.messages.at(-1)?.id ?? null;
        if (!open && knownMessageRef.current && newest && newest !== knownMessageRef.current) {
          const oldIndex = payload.messages.findIndex((message) => message.id === knownMessageRef.current);
          setUnread((count) => count + (oldIndex >= 0 ? payload.messages.length - oldIndex - 1 : 1));
        }
        knownMessageRef.current = newest;
        setMessages(payload.messages);
      } catch (chatError) {
        if (!cancelled) setError(chatError instanceof Error ? chatError.message : "Room chat could not be synchronized.");
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, open ? CHAT_POLL_MS : 4_000);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [session, open]);

  useEffect(() => {
    if (!open) return;
    const scroll = window.setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }), 50);
    return () => window.clearTimeout(scroll);
  }, [open, messages.length]);

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length) return;
    const next = [...files, ...selected].slice(0, MAX_FILES);
    if (next.some((file) => file.size > MAX_FILE_BYTES)) {
      setError("Each chat file must be 2 MB or smaller.");
      return;
    }
    if (next.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) {
      setError("Files in one message must total 2.5 MB or less.");
      return;
    }
    setError(null);
    setFiles(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || (!text.trim() && !files.length)) return;
    setPending(true);
    setError(null);
    try {
      const attachments: ChatAttachmentPayload[] = await Promise.all(files.map(async (file) => ({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        base64: await fileToBase64(file),
      })));
      await chatRequest(`/api/rooms/${session.roomCode}/chat`, session, {
        method: "POST",
        body: JSON.stringify({ text, attachments }),
      });
      setText("");
      setFiles([]);
      const payload = await chatRequest<{ messages: ChatMessage[] }>(`/api/rooms/${session.roomCode}/chat`, session);
      setMessages(payload.messages);
      knownMessageRef.current = payload.messages.at(-1)?.id ?? null;
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Message could not be sent.");
    } finally {
      setPending(false);
    }
  }

  async function downloadAttachment(attachmentId: string, name: string) {
    setError(null);
    try {
      const response = await fetch(`/api/rooms/${session.roomCode}/chat/files/${attachmentId}`, {
        cache: "no-store",
        headers: {
          "x-bidarena-player": session.playerId,
          "x-bidarena-token": session.token,
        },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "File download failed." })) as { error?: string };
        throw new Error(payload.error ?? "File download failed.");
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 2_000);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "File download failed.");
    }
  }

  return (
    <>
      <button className="room-chat-launcher" type="button" onClick={() => { setUnread(0); setOpen(true); }} aria-label="Open room chat">
        <MessageCircle size={18} />
        <span>CHAT</span>
        {unread ? <b>{Math.min(unread, 99)}</b> : null}
      </button>
      {open ? <aside className="room-chat-drawer" aria-label="Room chat">
        <header>
          <div><MessageCircle size={17} /><span><strong>ROOM CHAT</strong><small>ROOM {session.roomCode}</small></span></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close chat"><X size={17} /></button>
        </header>
        <div className="room-chat-messages" ref={listRef}>
          {messages.length ? messages.map((message) => {
            const mine = message.participantId === session.playerId;
            return <article key={message.id} className={mine ? "mine" : ""} style={{ "--chat-team": message.color } as React.CSSProperties}>
              <div className="room-chat-author"><b>{message.teamCode}</b><strong>{message.teamName}</strong><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>
              {message.text ? <p>{message.text}</p> : null}
              {message.attachments.length ? <div className="room-chat-files">{message.attachments.map((file) => <button key={file.id} type="button" onClick={() => void downloadAttachment(file.id, file.name)}><FileText size={15}/><span><strong>{file.name}</strong><small>{Math.max(1, Math.round(file.size / 1024))} KB</small></span><Download size={14}/></button>)}</div> : null}
            </article>;
          }) : <div className="room-chat-empty"><MessageCircle size={27}/><strong>No messages yet</strong><span>Start the room conversation.</span></div>}
        </div>
        <form className="room-chat-composer" onSubmit={submit}>
          {files.length ? <div className="room-chat-selected-files">{files.map((file, index) => <span key={file.name + index}><FileText size={13}/><b>{file.name}</b><button type="button" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={12}/></button></span>)}</div> : null}
          {error ? <div className="room-chat-error">{error}</div> : null}
          <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={2_000} placeholder="Message the room…" rows={3} />
          <div>
            <label className="room-chat-attach"><Paperclip size={15}/><span>Attach</span><input type="file" accept={ACCEPTED} multiple onChange={selectFiles} disabled={pending || files.length >= MAX_FILES}/></label>
            <small>{files.length}/3 files · 2 MB each</small>
            <button className="room-chat-send" disabled={pending || (!text.trim() && !files.length)}>{pending ? <LoaderCircle className="spin" size={15}/> : <Send size={15}/>} Send</button>
          </div>
        </form>
      </aside> : null}
    </>
  );
}
