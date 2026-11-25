import type { SignalingMessage, PeerMetadata } from '../src/core/types';

export type { SignalingMessage, PeerMetadata };

export interface Env {
  ROOM: DurableObjectNamespace;
}

type WebSocketWithPeerId = WebSocket & { peerId: string; roomKey: string };

export function generatePeerId(): string {
  return crypto.randomUUID();
}

export function getDailySalt(): string {
  const dayNumber = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  return dayNumber.toString();
}

export async function hashIp(ip: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function extractClientIp(request: Request): string {
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) return cfIp;

  const forwardedFor = request.headers.get('X-Forwarded-For');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0].trim();
    if (firstIp) return firstIp;
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;

  return '0.0.0.0';
}

export function isValidSignalingMessage(message: unknown): message is SignalingMessage {
  if (!message || typeof message !== 'object') return false;
  const msg = message as Record<string, unknown>;
  const type = msg.type as string;
  if (!['JOIN_LOCAL', 'JOIN_ROOM', 'PEER_LIST', 'PEER_JOINED', 'PEER_LEFT', 'SIGNAL'].includes(type)) {
    return false;
  }

  switch (type) {
    case 'JOIN_LOCAL':
      return msg.peerInfo !== undefined && isValidPeerMetadata(msg.peerInfo);
    case 'JOIN_ROOM':
      return typeof msg.roomId === 'string' && msg.peerInfo !== undefined && isValidPeerMetadata(msg.peerInfo);
    case 'SIGNAL':
      return typeof msg.targetId === 'string' && typeof msg.senderId === 'string' && msg.signal !== undefined;
    case 'PEER_LIST':
      return Array.isArray(msg.peers);
    case 'PEER_JOINED':
      return msg.peer !== undefined && isValidPeerMetadata(msg.peer);
    case 'PEER_LEFT':
      return typeof msg.peerId === 'string';
    default:
      return false;
  }
}

export function isValidPeerMetadata(peer: unknown): peer is PeerMetadata {
  if (!peer || typeof peer !== 'object') return false;
  const p = peer as Record<string, unknown>;
  return (
    typeof p.peerId === 'string' &&
    typeof p.alias === 'string' &&
    ['desktop', 'mobile'].includes(p.deviceType as string) &&
    typeof p.os === 'string' &&
    typeof p.browser === 'string' &&
    typeof p.ipHash === 'string' &&
    typeof p.joinedAt === 'number'
  );
}

export class Room implements DurableObject {
  private peers: Map<string, { ws: WebSocketWithPeerId; metadata: PeerMetadata }>;
  private roomKey: string;

  constructor(state: DurableObjectState, _env: Env) {
    this.peers = new Map();
    this.roomKey = state.id.toString();
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 400 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();

    const peerId = generatePeerId();
    const wsWithPeerId = server as WebSocketWithPeerId;
    wsWithPeerId.peerId = peerId;
    wsWithPeerId.roomKey = this.roomKey;

    this.peers.set(peerId, { ws: wsWithPeerId, metadata: null as unknown as PeerMetadata });

    server.addEventListener('message', (event) => this.webSocketMessage(wsWithPeerId, event.data));
    server.addEventListener('close', (event) => this.webSocketClose(wsWithPeerId, event.code, event.reason));
    server.addEventListener('error', (event) => this.webSocketError(wsWithPeerId, event));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocketWithPeerId, message: string | ArrayBuffer): Promise<void> {
    let parsed: unknown;
    try {
      const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
      parsed = JSON.parse(text);
    } catch {
      this.sendError(ws, 'Invalid JSON message');
      return;
    }

    if (!isValidSignalingMessage(parsed)) {
      this.sendError(ws, 'Invalid signaling message format');
      return;
    }

    switch (parsed.type) {
      case 'JOIN_LOCAL': {
        if (!isValidPeerMetadata(parsed.peerInfo)) {
          this.sendError(ws, 'Invalid peer metadata');
          return;
        }
        await this.handleJoinLocal(ws, parsed.peerInfo);
        break;
      }
      case 'JOIN_ROOM': {
        if (!isValidPeerMetadata(parsed.peerInfo) || typeof parsed.roomId !== 'string') {
          this.sendError(ws, 'Invalid JOIN_ROOM payload');
          return;
        }
        await this.handleJoinRoom(ws, parsed.roomId, parsed.peerInfo);
        break;
      }
      case 'SIGNAL': {
        await this.handleSignal(ws, parsed);
        break;
      }
      default:
        this.sendError(ws, `Unsupported message type: ${parsed.type}`);
    }
  }

  private async handleJoinLocal(ws: WebSocketWithPeerId, peerInfo: PeerMetadata): Promise<void> {
    const ip = extractClientIp(new Request('http://localhost'));
    const salt = getDailySalt();
    const ipHash = await hashIp(ip, salt);

    const updatedPeerInfo: PeerMetadata = {
      ...peerInfo,
      ipHash,
      peerId: ws.peerId,
    };

    this.peers.set(ws.peerId, { ws, metadata: updatedPeerInfo });

    const peerList: PeerMetadata[] = [];
    for (const [, peer] of this.peers) {
      if (peer.metadata && peer.metadata.peerId !== ws.peerId) {
        peerList.push(peer.metadata);
      }
    }

    this.send(ws, { type: 'PEER_LIST', peers: peerList } satisfies SignalingMessage);

    const joinedMessage: SignalingMessage = { type: 'PEER_JOINED', peer: updatedPeerInfo };
    this.broadcast(joinedMessage, ws.peerId);
  }

  private async handleJoinRoom(ws: WebSocketWithPeerId, _roomId: string, peerInfo: PeerMetadata): Promise<void> {
    const ip = extractClientIp(new Request('http://localhost'));
    const salt = getDailySalt();
    const ipHash = await hashIp(ip, salt);

    const updatedPeerInfo: PeerMetadata = {
      ...peerInfo,
      ipHash,
      peerId: ws.peerId,
    };

    this.peers.set(ws.peerId, { ws, metadata: updatedPeerInfo });

    const peerList: PeerMetadata[] = [];
    for (const [, peer] of this.peers) {
      if (peer.metadata && peer.metadata.peerId !== ws.peerId) {
        peerList.push(peer.metadata);
      }
    }

    this.send(ws, { type: 'PEER_LIST', peers: peerList } satisfies SignalingMessage);

    const joinedMessage: SignalingMessage = { type: 'PEER_JOINED', peer: updatedPeerInfo };
    this.broadcast(joinedMessage, ws.peerId);
  }

  private async handleSignal(ws: WebSocketWithPeerId, message: SignalingMessage): Promise<void> {
    if (message.type !== 'SIGNAL') return;

    const targetPeer = this.peers.get(message.targetId);
    if (!targetPeer || targetPeer.ws.readyState !== WebSocket.OPEN) {
      this.sendError(ws, `Target peer ${message.targetId} not found or not connected`);
      return;
    }

    const forwardMessage: SignalingMessage = {
      type: 'SIGNAL',
      targetId: message.targetId,
      senderId: message.senderId,
      signal: message.signal,
    };

    this.send(targetPeer.ws, forwardMessage);
  }

  async webSocketClose(ws: WebSocketWithPeerId, _code: number, _reason: string): Promise<void> {
    const peerId = ws.peerId;
    const peer = this.peers.get(peerId);

    if (peer) {
      const leftMessage: SignalingMessage = { type: 'PEER_LEFT', peerId };
      this.broadcast(leftMessage, peerId);
      this.peers.delete(peerId);
    }
  }

  async webSocketError(ws: WebSocketWithPeerId, event: Event): Promise<void> {
    console.error(`WebSocket error for peer ${ws.peerId}:`, event);
    await this.webSocketClose(ws, 1011, 'WebSocket error');
  }

  private send(ws: WebSocket, message: SignalingMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, error: string): void {
    this.send(ws, { type: 'ERROR', error } as unknown as SignalingMessage);
  }

  private broadcast(message: SignalingMessage, excludePeerId: string): void {
    for (const [peerId, peer] of this.peers) {
      if (peerId !== excludePeerId && peer.ws.readyState === WebSocket.OPEN) {
        this.send(peer.ws, message);
      }
    }
  }
}

const workerHandler = {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    if (url.pathname.startsWith('/room/')) {
      const roomId = url.pathname.slice('/room/'.length);
      if (!roomId) {
        return new Response('Room ID required', { status: 400 });
      }

      const durableObjectId = env.ROOM.idFromName(roomId);
      const durableObject = env.ROOM.get(durableObjectId);
      return durableObject.fetch(request);
    }

    if (url.pathname === '/local') {
      const ip = extractClientIp(request);
      const salt = getDailySalt();
      const ipHash = await hashIp(ip, salt);
      const roomKey = `local-${ipHash}`;

      const durableObjectId = env.ROOM.idFromName(roomKey);
      const durableObject = env.ROOM.get(durableObjectId);
      return durableObject.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

export default workerHandler;