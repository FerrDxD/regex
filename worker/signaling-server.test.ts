import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock WebSocket globally for tests - must be hoisted before imports
vi.hoisted(() => {
  const mockWebSocketClass = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  };

  const OriginalResponse = global.Response;
  const MockResponse = function(this: Response, body?: BodyInit | null, init?: ResponseInit) {
    const status = init?.status ?? 200;
    // Allow status 101 for WebSocket upgrades
    const response = new OriginalResponse(body, { ...init, status: status === 101 ? 200 : status });
    Object.defineProperty(response, 'status', { value: status, writable: false });
    if (init?.webSocket) {
      Object.defineProperty(response, 'webSocket', { value: init.webSocket, writable: false });
    }
    return response;
  } as unknown as typeof Response;
  MockResponse.prototype = OriginalResponse.prototype;
  vi.stubGlobal('Response', MockResponse);

  vi.stubGlobal('WebSocket', mockWebSocketClass);
});

// These functions need to be hoisted too since they're used in the hoisted block
function createMockWebSocket(peerId: string): MockWebSocket {
  const mockWs = {
    peerId,
    roomKey: '',
    readyState: 1, // WebSocket.OPEN
    send: vi.fn(),
    close: vi.fn(),
    accept: vi.fn(),
    addEventListener: vi.fn((event: string, handler: Function) => {
      if (event === 'message') mockWs._messageHandler = handler as (event: { data: string | ArrayBuffer }) => void;
      else if (event === 'close') mockWs._closeHandler = handler as (event: { code: number; reason: string }) => void;
      else if (event === 'error') mockWs._errorHandler = handler as (event: Event) => void;
    }),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    binaryType: 'arraybuffer',
    bufferedAmount: 0,
    extensions: '',
    protocol: '',
    url: '',
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  } as unknown as MockWebSocket;
  return mockWs;
}

// Mock WebSocketPair for Cloudflare Workers
const mockWebSocketPair = class {
  0: WebSocket;
  1: WebSocket;
  constructor() {
    this[0] = createMockWebSocket('client') as unknown as WebSocket;
    this[1] = createMockWebSocket('server') as unknown as WebSocket;
  }
};
vi.stubGlobal('WebSocketPair', mockWebSocketPair);

interface MockWebSocket {
  peerId: string;
  roomKey: string;
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
  accept: ReturnType<typeof vi.fn>;
  serializeAttachment: ReturnType<typeof vi.fn>;
  deserializeAttachment: ReturnType<typeof vi.fn>;
  binaryType: BinaryType;
  bufferedAmount: number;
  extensions: string;
  protocol: string;
  url: string;
  onopen: null;
  onclose: null;
  onerror: null;
  onmessage: null;
  CONNECTING: 0;
  OPEN: 1;
  CLOSING: 2;
  CLOSED: 3;
  _messageHandler?: (event: { data: string | ArrayBuffer }) => void;
  _closeHandler?: (event: { code: number; reason: string }) => void;
  _errorHandler?: (event: Event) => void;
}

import {
  Room,
  generatePeerId,
  getDailySalt,
  hashIp,
  extractClientIp,
  isValidSignalingMessage,
  isValidPeerMetadata,
} from './signaling-server';
import type { SignalingMessage, PeerMetadata, Env } from './signaling-server';

function createMockDurableObjectState(): DurableObjectState {
  const mockState = {
    id: { toString: () => 'test-room-id' },
    storage: {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    },
    blockConcurrencyWhile: vi.fn((cb) => cb()),
    waitUntil: vi.fn(),
    getWebSockets: vi.fn(() => []),
    acceptWebSocket: vi.fn(),
    getTags: vi.fn(() => []),
    setTags: vi.fn(),
    alarm: vi.fn(),
    getAlarm: vi.fn(),
  } as unknown as DurableObjectState;
  return mockState;
}

function createMockResponse(status: number, webSocket?: WebSocket): Response {
  const mockResponse = {
    status,
    statusText: status === 101 ? 'Switching Protocols' : 'OK',
    ok: status >= 200 && status < 300,
    webSocket,
    headers: new Headers(),
    body: null,
    bodyUsed: false,
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    blob: vi.fn(),
    clone: vi.fn(),
    formData: vi.fn(),
    json: vi.fn(),
    text: vi.fn().mockResolvedValue(''),
    bytes: vi.fn(),
    redirected: false,
    type: 'default' as ResponseType,
    url: '',
  } as unknown as Response;
  return mockResponse;
}

function createMockDurableObject(): { fetch: ReturnType<typeof vi.fn> } {
  return {
    fetch: vi.fn().mockResolvedValue(createMockResponse(101, createMockWebSocket('client'))),
  };
}

function createMockEnv(): Env {
  const mockDurableObject = createMockDurableObject();
  return {
    ROOM: {
      idFromName: vi.fn((name: string) => ({ toString: () => name })),
      get: vi.fn(() => mockDurableObject),
      newUniqueId: vi.fn(),
    } as unknown as DurableObjectNamespace,
  };
}

describe('Utility Functions', () => {
  describe('generatePeerId', () => {
    it('should generate a valid UUID', () => {
      const id = generatePeerId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generatePeerId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('getDailySalt', () => {
    it('should return a string representation of day number', () => {
      const salt = getDailySalt();
      expect(typeof salt).toBe('string');
      expect(Number(salt)).toBe(Math.floor(Date.now() / (24 * 60 * 60 * 1000)));
    });

    it('should be consistent within the same day', () => {
      const salt1 = getDailySalt();
      const salt2 = getDailySalt();
      expect(salt1).toBe(salt2);
    });
  });

  describe('hashIp', () => {
    it('should produce a consistent SHA-256 hash for same input', async () => {
      const ip = '192.168.1.1';
      const salt = '12345';
      const hash1 = await hashIp(ip, salt);
      const hash2 = await hashIp(ip, salt);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce different hashes for different IPs', async () => {
      const salt = '12345';
      const hash1 = await hashIp('192.168.1.1', salt);
      const hash2 = await hashIp('192.168.1.2', salt);
      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes for different salts', async () => {
      const ip = '192.168.1.1';
      const hash1 = await hashIp(ip, 'salt1');
      const hash2 = await hashIp(ip, 'salt2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('extractClientIp', () => {
    it('should extract IP from CF-Connecting-IP header', () => {
      const request = new Request('http://localhost', {
        headers: { 'CF-Connecting-IP': '203.0.113.195' },
      });
      expect(extractClientIp(request)).toBe('203.0.113.195');
    });

    it('should extract first IP from X-Forwarded-For header', () => {
      const request = new Request('http://localhost', {
        headers: { 'X-Forwarded-For': '203.0.113.195, 70.41.3.18, 150.172.238.178' },
      });
      expect(extractClientIp(request)).toBe('203.0.113.195');
    });

    it('should extract IP from x-real-ip header', () => {
      const request = new Request('http://localhost', {
        headers: { 'x-real-ip': '203.0.113.195' },
      });
      expect(extractClientIp(request)).toBe('203.0.113.195');
    });

    it('should prioritize CF-Connecting-IP over other headers', () => {
      const request = new Request('http://localhost', {
        headers: {
          'CF-Connecting-IP': '203.0.113.195',
          'X-Forwarded-For': '198.51.100.1',
          'x-real-ip': '192.0.2.1',
        },
      });
      expect(extractClientIp(request)).toBe('203.0.113.195');
    });

    it('should return default IP when no headers present', () => {
      const request = new Request('http://localhost');
      expect(extractClientIp(request)).toBe('0.0.0.0');
    });
  });

  describe('isValidSignalingMessage', () => {
    it('should return true for valid JOIN_LOCAL message', () => {
      const msg = {
        type: 'JOIN_LOCAL',
        peerInfo: {
          peerId: 'test-id',
          alias: 'Test',
          deviceType: 'desktop' as const,
          os: 'Windows',
          browser: 'Chrome',
          ipHash: 'abc123',
          joinedAt: Date.now(),
        },
      };
      expect(isValidSignalingMessage(msg)).toBe(true);
    });

    it('should return true for valid JOIN_ROOM message', () => {
      const msg = {
        type: 'JOIN_ROOM',
        roomId: 'ABC123',
        peerInfo: {
          peerId: 'test-id',
          alias: 'Test',
          deviceType: 'mobile' as const,
          os: 'iOS',
          browser: 'Safari',
          ipHash: 'abc123',
          joinedAt: Date.now(),
        },
      };
      expect(isValidSignalingMessage(msg)).toBe(true);
    });

    it('should return true for valid SIGNAL message', () => {
      const msg = {
        type: 'SIGNAL',
        targetId: 'target-id',
        senderId: 'sender-id',
        signal: { type: 'offer', sdp: 'test-sdp' },
      };
      expect(isValidSignalingMessage(msg)).toBe(true);
    });

    it('should return false for invalid message type', () => {
      const msg = { type: 'INVALID_TYPE' };
      expect(isValidSignalingMessage(msg)).toBe(false);
    });

    it('should return false for null or non-object', () => {
      expect(isValidSignalingMessage(null)).toBe(false);
      expect(isValidSignalingMessage('string')).toBe(false);
      expect(isValidSignalingMessage(123)).toBe(false);
    });

    it('should return false for missing peerInfo in JOIN_LOCAL', () => {
      const msg = { type: 'JOIN_LOCAL' };
      expect(isValidSignalingMessage(msg)).toBe(false);
    });

    it('should return false for missing roomId in JOIN_ROOM', () => {
      const msg = { type: 'JOIN_ROOM', peerInfo: { peerId: 'test-id' } };
      expect(isValidSignalingMessage(msg)).toBe(false);
    });

    it('should return false for missing targetId in SIGNAL', () => {
      const msg = { type: 'SIGNAL', senderId: 'sender-id', signal: {} };
      expect(isValidSignalingMessage(msg)).toBe(false);
    });
  });

  describe('isValidPeerMetadata', () => {
    it('should return true for valid peer metadata', () => {
      const peer = {
        peerId: 'test-id',
        alias: 'Test User',
        deviceType: 'desktop' as const,
        os: 'Windows 11',
        browser: 'Chrome 120',
        ipHash: 'abc123',
        joinedAt: Date.now(),
      };
      expect(isValidPeerMetadata(peer)).toBe(true);
    });

    it('should return false for invalid deviceType', () => {
      const peer = {
        peerId: 'test-id',
        alias: 'Test User',
        deviceType: 'tablet',
        os: 'Windows 11',
        browser: 'Chrome 120',
        ipHash: 'abc123',
        joinedAt: Date.now(),
      };
      expect(isValidPeerMetadata(peer)).toBe(false);
    });

    it('should return false for missing required fields', () => {
      const peer = {
        peerId: 'test-id',
        alias: 'Test User',
      };
      expect(isValidPeerMetadata(peer)).toBe(false);
    });

    it('should return false for null or non-object', () => {
      expect(isValidPeerMetadata(null)).toBe(false);
      expect(isValidPeerMetadata('string')).toBe(false);
    });
  });
});

describe('Room Durable Object', () => {
  let room: Room;
  let mockState: DurableObjectState;
  let mockEnv: Env;

  beforeEach(() => {
    mockState = createMockDurableObjectState();
    mockEnv = createMockEnv();
    room = new Room(mockState, mockEnv);
  });

  describe('fetch (WebSocket upgrade)', () => {
    it('should reject non-WebSocket upgrade requests', async () => {
      const request = new Request('http://localhost/room/test');
      const response = await room.fetch(request);
      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toBe('Expected WebSocket upgrade');
    });

    it('should accept WebSocket upgrade and return 101', async () => {
      const request = new Request('http://localhost/room/test', {
        headers: { Upgrade: 'websocket' },
      });
      const response = await room.fetch(request);
      expect(response.status).toBe(101);
      expect(response.webSocket).toBeDefined();
    });
  });

  describe('webSocketMessage', () => {
    let mockWs: MockWebSocket;

    beforeEach(() => {
      mockWs = createMockWebSocket('test-peer-id');
    });

    it('should reject invalid JSON', async () => {
      await room.webSocketMessage(mockWs, 'invalid json{');
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('Invalid JSON'));
    });

    it('should reject invalid signaling message format', async () => {
      await room.webSocketMessage(mockWs, JSON.stringify({ type: 'INVALID' }));
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('Invalid signaling message'));
    });

    it('should handle JOIN_LOCAL and send PEER_LIST', async () => {
      const peerInfo: PeerMetadata = {
        peerId: 'test-peer-id',
        alias: 'Test User',
        deviceType: 'desktop',
        os: 'Windows',
        browser: 'Chrome',
        ipHash: '',
        joinedAt: Date.now(),
      };

      await room.webSocketMessage(mockWs, JSON.stringify({ type: 'JOIN_LOCAL', peerInfo }));

      expect(mockWs.send).toHaveBeenCalled();
      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe('PEER_LIST');
      expect(Array.isArray(sentMessage.peers)).toBe(true);
    });

    it('should handle JOIN_ROOM and send PEER_LIST', async () => {
      const peerInfo: PeerMetadata = {
        peerId: 'test-peer-id',
        alias: 'Test User',
        deviceType: 'desktop',
        os: 'Windows',
        browser: 'Chrome',
        ipHash: '',
        joinedAt: Date.now(),
      };

      await room.webSocketMessage(mockWs, JSON.stringify({ type: 'JOIN_ROOM', roomId: 'ABC123', peerInfo }));

      expect(mockWs.send).toHaveBeenCalled();
      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe('PEER_LIST');
    });

    it('should broadcast PEER_JOINED when peer joins via JOIN_LOCAL', async () => {
      const peerInfo: PeerMetadata = {
        peerId: 'test-peer-id',
        alias: 'Test User',
        deviceType: 'desktop',
        os: 'Windows',
        browser: 'Chrome',
        ipHash: '',
        joinedAt: Date.now(),
      };

      const mockWs2 = createMockWebSocket('other-peer-id');
      const peerInfo2: PeerMetadata = {
        peerId: 'other-peer-id',
        alias: 'Other User',
        deviceType: 'mobile',
        os: 'iOS',
        browser: 'Safari',
        ipHash: '',
        joinedAt: Date.now(),
      };

      await room.webSocketMessage(mockWs2, JSON.stringify({ type: 'JOIN_LOCAL', peerInfo: peerInfo2 }));
      mockWs2.send.mockClear();

      await room.webSocketMessage(mockWs, JSON.stringify({ type: 'JOIN_LOCAL', peerInfo }));

      expect(mockWs2.send).toHaveBeenCalled();
      const sentMessage = JSON.parse(mockWs2.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe('PEER_JOINED');
      expect(sentMessage.peer.peerId).toBe('test-peer-id');
    });

    it('should handle SIGNAL and forward to target peer', async () => {
      const peerInfo: PeerMetadata = {
        peerId: 'sender-id',
        alias: 'Sender',
        deviceType: 'desktop',
        os: 'Windows',
        browser: 'Chrome',
        ipHash: '',
        joinedAt: Date.now(),
      };

      const targetWs = createMockWebSocket('target-id');
      const targetPeerInfo: PeerMetadata = {
        peerId: 'target-id',
        alias: 'Target',
        deviceType: 'mobile',
        os: 'iOS',
        browser: 'Safari',
        ipHash: '',
        joinedAt: Date.now(),
      };

      await room.webSocketMessage(targetWs, JSON.stringify({ type: 'JOIN_LOCAL', peerInfo: targetPeerInfo }));
      targetWs.send.mockClear();

      await room.webSocketMessage(mockWs, JSON.stringify({ type: 'JOIN_LOCAL', peerInfo }));
      mockWs.send.mockClear();

      const signalMessage: SignalingMessage = {
        type: 'SIGNAL',
        targetId: 'target-id',
        senderId: 'sender-id',
        signal: { type: 'offer', sdp: 'test-sdp' },
      };

      await room.webSocketMessage(mockWs, JSON.stringify(signalMessage));

      expect(targetWs.send).toHaveBeenCalled();
      // The first call is PEER_JOINED from mockWs joining, second call is SIGNAL
      const signalCall = targetWs.send.mock.calls.find((call) => {
        const msg = JSON.parse(call[0]);
        return msg.type === 'SIGNAL';
      });
      expect(signalCall).toBeDefined();
      const forwardedMessage = JSON.parse(signalCall![0]);
      expect(forwardedMessage.type).toBe('SIGNAL');
      expect(forwardedMessage.senderId).toBe('sender-id');
      expect(forwardedMessage.signal).toEqual({ type: 'offer', sdp: 'test-sdp' });
    });

    it('should send error when SIGNAL target not found', async () => {
      const peerInfo: PeerMetadata = {
        peerId: 'sender-id',
        alias: 'Sender',
        deviceType: 'desktop',
        os: 'Windows',
        browser: 'Chrome',
        ipHash: '',
        joinedAt: Date.now(),
      };

      await room.webSocketMessage(mockWs, JSON.stringify({ type: 'JOIN_LOCAL', peerInfo }));
      mockWs.send.mockClear();

      const signalMessage: SignalingMessage = {
        type: 'SIGNAL',
        targetId: 'non-existent-id',
        senderId: 'sender-id',
        signal: { type: 'offer', sdp: 'test-sdp' },
      };

      await room.webSocketMessage(mockWs, JSON.stringify(signalMessage));

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });
  });

  describe('webSocketClose', () => {
    it('should broadcast PEER_LEFT when peer disconnects', async () => {
      // Use the same pattern as the passing SIGNAL test
      const targetWs = createMockWebSocket('target-id');
      const targetPeerInfo: PeerMetadata = {
        peerId: 'target-id',
        alias: 'Target User',
        deviceType: 'mobile',
        os: 'iOS',
        browser: 'Safari',
        ipHash: '',
        joinedAt: Date.now(),
      };
      await room.webSocketMessage(targetWs, JSON.stringify({ type: 'JOIN_LOCAL', peerInfo: targetPeerInfo }));
      targetWs.send.mockClear();

      const mockWs = createMockWebSocket('sender-id');
      const peerInfo: PeerMetadata = {
        peerId: 'sender-id',
        alias: 'Sender User',
        deviceType: 'desktop',
        os: 'Windows',
        browser: 'Chrome',
        ipHash: '',
        joinedAt: Date.now(),
      };
      await room.webSocketMessage(mockWs, JSON.stringify({ type: 'JOIN_LOCAL', peerInfo }));
      mockWs.send.mockClear();

      // Verify SIGNAL forwarding works (same as passing test)
      const signalMessage: SignalingMessage = {
        type: 'SIGNAL',
        targetId: 'target-id',
        senderId: 'sender-id',
        signal: { type: 'offer', sdp: 'test-sdp' },
      };
      await room.webSocketMessage(mockWs, JSON.stringify(signalMessage));
      expect(targetWs.send).toHaveBeenCalled();
      targetWs.send.mockClear();

      // Now test webSocketClose broadcast
      await room.webSocketClose(mockWs, 1000, 'Normal closure');

      expect(targetWs.send).toHaveBeenCalled();
      const sentMessage = JSON.parse(targetWs.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe('PEER_LEFT');
      expect(sentMessage.peerId).toBe('sender-id');
    });

    it('should remove peer from peers map on close', async () => {
      const mockWs = createMockWebSocket('leaving-peer');
      const peerInfo: PeerMetadata = {
        peerId: 'leaving-peer',
        alias: 'Leaving User',
        deviceType: 'desktop',
        os: 'Windows',
        browser: 'Chrome',
        ipHash: '',
        joinedAt: Date.now(),
      };

      await room.webSocketMessage(mockWs, JSON.stringify({ type: 'JOIN_LOCAL', peerInfo }));
      await room.webSocketClose(mockWs, 1000, 'Normal closure');

      const signalMessage: SignalingMessage = {
        type: 'SIGNAL',
        targetId: 'leaving-peer',
        senderId: 'some-sender',
        signal: { type: 'offer', sdp: 'test-sdp' },
      };

      const senderWs = createMockWebSocket('some-sender');
      await room.webSocketMessage(senderWs, JSON.stringify({ type: 'JOIN_LOCAL', peerInfo }));
      senderWs.send.mockClear();
      await room.webSocketMessage(senderWs, JSON.stringify(signalMessage));

      expect(senderWs.send).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });
  });
});

describe('Worker fetch handler', () => {
  let mockEnv: Env;
  let mockCtx: ExecutionContext;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockCtx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as unknown as ExecutionContext;
  });

  it('should return 404 for unknown paths', async () => {
    const { default: worker } = await import('./signaling-server');
    const request = new Request('http://localhost/unknown');
    const response = await worker.fetch(request, mockEnv, mockCtx);
    expect(response.status).toBe(404);
  });

  it('should return 200 for /health', async () => {
    const { default: worker } = await import('./signaling-server');
    const request = new Request('http://localhost/health');
    const response = await worker.fetch(request, mockEnv, mockCtx);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe('OK');
  });

  it('should route /room/:id to Durable Object', async () => {
    const { default: worker } = await import('./signaling-server');
    const request = new Request('http://localhost/room/ABC123', {
      headers: { Upgrade: 'websocket' },
    });
    const response = await worker.fetch(request, mockEnv, mockCtx);
    expect(response.status).toBe(101);
    expect(mockEnv.ROOM.idFromName).toHaveBeenCalledWith('ABC123');
    expect(mockEnv.ROOM.get).toHaveBeenCalled();
  });

  it('should route /local to Durable Object with IP hash', async () => {
    const { default: worker } = await import('./signaling-server');
    const request = new Request('http://localhost/local', {
      headers: { 'CF-Connecting-IP': '203.0.113.195', Upgrade: 'websocket' },
    });
    const response = await worker.fetch(request, mockEnv, mockCtx);
    expect(response.status).toBe(101);
    expect(mockEnv.ROOM.idFromName).toHaveBeenCalled();
    const callArg = (mockEnv.ROOM.idFromName as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg).toMatch(/^local-/);
  });
});