import type { FileMeta, P2PControlMessage } from './types.js';

export type { FileMeta, P2PControlMessage } from './types.js';

// --- Control message factories ---

export function createTextDrop(text: string, senderId: string): P2PControlMessage {
  return { type: 'TEXT_DROP', text, senderId };
}

export function createTransferOffer(files: FileMeta[], senderId: string): P2PControlMessage {
  return { type: 'TRANSFER_OFFER', files, senderId };
}

export function createTransferAccept(fileId: string, receiverId: string): P2PControlMessage {
  return { type: 'TRANSFER_ACCEPT', fileId, receiverId };
}

export function createTransferDecline(fileId: string, receiverId: string): P2PControlMessage {
  return { type: 'TRANSFER_DECLINE', fileId, receiverId };
}

export function createFileComplete(fileId: string, receiverId: string): P2PControlMessage {
  return { type: 'FILE_COMPLETE', fileId, receiverId };
}

// --- Type guard ---

function isFileMeta(value: unknown): value is FileMeta {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.fileId === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.size === 'number' &&
    typeof obj.type === 'string' &&
    typeof obj.chunkCount === 'number'
  );
}

export function isP2PControlMessage(data: unknown): data is P2PControlMessage {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj.type !== 'string') return false;

  switch (obj.type) {
    case 'TEXT_DROP':
      return typeof obj.text === 'string' && typeof obj.senderId === 'string';
    case 'TRANSFER_OFFER':
      return Array.isArray(obj.files) && obj.files.every(isFileMeta) && typeof obj.senderId === 'string';
    case 'TRANSFER_ACCEPT':
      return typeof obj.fileId === 'string' && typeof obj.receiverId === 'string';
    case 'TRANSFER_DECLINE':
      return typeof obj.fileId === 'string' && typeof obj.receiverId === 'string';
    case 'FILE_COMPLETE':
      return typeof obj.fileId === 'string' && typeof obj.receiverId === 'string';
    default:
      return false;
  }
}

// --- Serialize / parse ---

export function serializeControlMessage(msg: P2PControlMessage): string {
  return JSON.stringify(msg);
}

export function parseControlMessage(raw: string): P2PControlMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isP2PControlMessage(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

// --- Send / receive over data channel ---

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function isArrayBufferLike(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer ||
    (typeof value === 'object' && value !== null && 'byteLength' in value);
}

export function sendControlMessage(channel: RTCDataChannel, message: P2PControlMessage): void {
  if (channel.readyState !== 'open') {
    console.warn('sendControlMessage: channel not open');
    return;
  }
  const json = serializeControlMessage(message);
  const data = encoder.encode(json);
  // Create a new ArrayBuffer to ensure compatibility with jsdom
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  channel.send(buffer);
}

export function receiveControlMessage(
  channel: RTCDataChannel,
  onMessage: (msg: P2PControlMessage) => void
): () => void {
  const messageHandler = (event: MessageEvent): void => {
    const data = event.data;
    if (!isArrayBufferLike(data)) {
      return;
    }
    const json = decoder.decode(new Uint8Array(data));
    const msg = parseControlMessage(json);
    if (msg !== null) {
      onMessage(msg);
    }
  };

  channel.onmessage = messageHandler;

  return (): void => {
    channel.onmessage = null;
  };
}

// --- Instant Text Drop (pure TS, no React, no dangerouslySetInnerHTML) ---

// http/https only — never matches javascript: or data:
// Uses negative lookahead to stop before another http/https URL
export const URL_REGEX: RegExp = /https?:\/\/[^\s<>"'()]+?(?=\s|$|https?:\/\/)/g;

export type TextSegment =
  | { type: 'text'; content: string }
  | { type: 'url'; content: string; href: string };

function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseTextSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  URL_REGEX.lastIndex = 0;
  let lastEnd = 0;

  let match: RegExpExecArray | null;
  while ((match = URL_REGEX.exec(text)) !== null) {
    const [url] = match;
    const { index } = match;

    // Validate the matched URL is actually a safe http/https URL
    if (!isValidHttpUrl(url)) {
      continue;
    }

    if (index > lastEnd) {
      segments.push({ type: 'text', content: text.slice(lastEnd, index) });
    }
    segments.push({ type: 'url', content: url, href: url });
    lastEnd = index + url.length;
  }

  if (lastEnd < text.length) {
    segments.push({ type: 'text', content: text.slice(lastEnd) });
  }

  return segments;
}

export function isSafeUrl(url: string): boolean {
  return isValidHttpUrl(url);
}