import { describe, it, expect } from 'vitest';
import {
  createTextDrop,
  createTransferOffer,
  createTransferAccept,
  createTransferDecline,
  createFileComplete,
  isP2PControlMessage,
  serializeControlMessage,
  parseControlMessage,
  URL_REGEX,
  parseTextSegments,
  isSafeUrl,
} from './controlProtocol';
import type { FileMeta } from './types';

const fileMeta: FileMeta = {
  fileId: 'f1',
  name: 'test.txt',
  size: 1024,
  type: 'text/plain',
  chunkCount: 2,
};

describe('control message factories', () => {
  it('createTextDrop', () => {
    const msg = createTextDrop('hello', 's1');
    expect(msg).toEqual({ type: 'TEXT_DROP', text: 'hello', senderId: 's1' });
  });

  it('createTransferOffer', () => {
    const msg = createTransferOffer([fileMeta], 's1');
    expect(msg).toEqual({ type: 'TRANSFER_OFFER', files: [fileMeta], senderId: 's1' });
  });

  it('createTransferAccept', () => {
    const msg = createTransferAccept('f1', 'r1');
    expect(msg).toEqual({ type: 'TRANSFER_ACCEPT', fileId: 'f1', receiverId: 'r1' });
  });

  it('createTransferDecline', () => {
    const msg = createTransferDecline('f1', 'r1');
    expect(msg).toEqual({ type: 'TRANSFER_DECLINE', fileId: 'f1', receiverId: 'r1' });
  });

  it('createFileComplete', () => {
    const msg = createFileComplete('f1', 'r1');
    expect(msg).toEqual({ type: 'FILE_COMPLETE', fileId: 'f1', receiverId: 'r1' });
  });
});

describe('isP2PControlMessage', () => {
  it('accepts all valid types', () => {
    expect(isP2PControlMessage(createTextDrop('t', 's'))).toBe(true);
    expect(isP2PControlMessage(createTransferOffer([fileMeta], 's'))).toBe(true);
    expect(isP2PControlMessage(createTransferAccept('f', 'r'))).toBe(true);
    expect(isP2PControlMessage(createTransferDecline('f', 'r'))).toBe(true);
    expect(isP2PControlMessage(createFileComplete('f', 'r'))).toBe(true);
  });

  it('rejects non-objects', () => {
    expect(isP2PControlMessage(null)).toBe(false);
    expect(isP2PControlMessage('string')).toBe(false);
    expect(isP2PControlMessage(42)).toBe(false);
    expect(isP2PControlMessage(undefined)).toBe(false);
  });

  it('rejects unknown type', () => {
    expect(isP2PControlMessage({ type: 'UNKNOWN' })).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(isP2PControlMessage({ type: 'TEXT_DROP' })).toBe(false);
    expect(isP2PControlMessage({ type: 'TEXT_DROP', text: 't' })).toBe(false);
    expect(isP2PControlMessage({ type: 'TRANSFER_OFFER', files: [] })).toBe(false);
  });
});

describe('serialize / parse round-trip', () => {
  it('round-trips all message types', () => {
    const messages = [
      createTextDrop('hello', 's1'),
      createTransferOffer([fileMeta], 's1'),
      createTransferAccept('f1', 'r1'),
      createTransferDecline('f1', 'r1'),
      createFileComplete('f1', 'r1'),
    ];
    for (const msg of messages) {
      const raw = serializeControlMessage(msg);
      expect(typeof raw).toBe('string');
      expect(parseControlMessage(raw)).toEqual(msg);
    }
  });

  it('returns null on invalid JSON', () => {
    expect(parseControlMessage('not json')).toBeNull();
    expect(parseControlMessage('')).toBeNull();
    expect(parseControlMessage('{')).toBeNull();
  });

  it('returns null on invalid message shape', () => {
    expect(parseControlMessage(JSON.stringify({ type: 'UNKNOWN' }))).toBeNull();
    expect(parseControlMessage(JSON.stringify({ type: 'TEXT_DROP' }))).toBeNull();
  });
});

describe('parseTextSegments', () => {
  it('plain text only', () => {
    expect(parseTextSegments('hello world')).toEqual([
      { type: 'text', content: 'hello world' },
    ]);
  });

  it('single URL', () => {
    expect(parseTextSegments('visit https://example.com now')).toEqual([
      { type: 'text', content: 'visit ' },
      { type: 'url', content: 'https://example.com', href: 'https://example.com' },
      { type: 'text', content: ' now' },
    ]);
  });

  it('multiple URLs', () => {
    expect(parseTextSegments('a https://a.com b https://b.com c')).toEqual([
      { type: 'text', content: 'a ' },
      { type: 'url', content: 'https://a.com', href: 'https://a.com' },
      { type: 'text', content: ' b ' },
      { type: 'url', content: 'https://b.com', href: 'https://b.com' },
      { type: 'text', content: ' c' },
    ]);
  });

  it('empty string', () => {
    expect(parseTextSegments('')).toEqual([]);
  });

  it('URL at start and end', () => {
    expect(parseTextSegments('https://start.com middle https://end.com')).toEqual([
      { type: 'url', content: 'https://start.com', href: 'https://start.com' },
      { type: 'text', content: ' middle ' },
      { type: 'url', content: 'https://end.com', href: 'https://end.com' },
    ]);
  });
});

describe('URL_REGEX safety', () => {
  it('does not match javascript:', () => {
    expect('javascript:alert(1)'.match(URL_REGEX)).toBeNull();
  });

  it('does not match data:', () => {
    expect('data:text/html,<script>'.match(URL_REGEX)).toBeNull();
  });

  it('matches http and https', () => {
    expect('https://example.com'.match(URL_REGEX)?.[0]).toBe('https://example.com');
    expect('http://example.com/path?q=1'.match(URL_REGEX)?.[0]).toBe('http://example.com/path?q=1');
  });
});

describe('isSafeUrl', () => {
  it('accepts http and https', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('http://example.com/path?q=1')).toBe(true);
  });

  it('rejects javascript and data', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>')).toBe(false);
  });

  it('rejects invalid URLs', () => {
    expect(isSafeUrl('not a url')).toBe(false);
    expect(isSafeUrl('')).toBe(false);
    expect(isSafeUrl('ftp://example.com')).toBe(false);
  });
});
