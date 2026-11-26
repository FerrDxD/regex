import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createHash } from 'crypto';

type PeerMetadata = {
  peerId: string;
  alias: string;
  deviceType: 'desktop' | 'mobile';
  os: string;
  browser: string;
  ipHash: string;
  joinedAt: number;
};

type SignalingMessage =
  | { type: 'JOIN_LOCAL'; peerInfo: PeerMetadata }
  | { type: 'JOIN_ROOM'; roomId: string; peerInfo: PeerMetadata }
  | { type: 'PEER_LIST'; peers: PeerMetadata[] }
  | { type: 'PEER_JOINED'; peer: PeerMetadata }
  | { type: 'PEER_LEFT'; peerId: string }
  | { type: 'SIGNAL'; targetId: string; senderId: string; signal: unknown }
  | { type: 'ERROR'; error: string };

type PeerEntry = {
  ws: WebSocket & { peerId?: string; ipHash?: string };
  metadata: PeerMetadata | null;
};

type Room = Map<string, PeerEntry>;
const rooms = new Map<string, Room>();

function generatePeerId(): string {
  return crypto.randomUUID();
}

function getDailySalt(): string {
  return Math.floor(Date.now() / (24 * 60 * 60 * 1000)).toString();
}

function hashIp(ip: string, salt: string): string {
  return createHash('sha256').update(ip + salt).digest('hex');
}

function extractClientIp(
  headers: { [key: string]: string | string[] | undefined },
  socketRemoteAddress?: string | null
): string {
  const xff = headers['x-forwarded-for'];
  if (xff) {
    const list = Array.isArray(xff) ? xff : String(xff).split(',');
    const first = list[0]?.trim();
    if (first) return first;
  }
  const realIp = headers['x-real-ip'];
  if (realIp) return Array.isArray(realIp) ? realIp[0] : String(realIp);
  if (socketRemoteAddress) return socketRemoteAddress;
  return '0.0.0.0';
}

function isValidPeerMetadata(peer: unknown): peer is PeerMetadata {
  if (!peer || typeof peer !== 'object') return false;
  const p = peer as Record<string, unknown>;
  return (
    typeof p.peerId === 'string' &&
    typeof p.alias === 'string' &&
    (p.deviceType === 'desktop' || p.deviceType === 'mobile') &&
    typeof p.os === 'string' &&
    typeof p.browser === 'string' &&
    typeof p.ipHash === 'string' &&
    typeof p.joinedAt === 'number'
  );
}

function isValidSignalingMessage(message: unknown): message is SignalingMessage {
  if (!message || typeof message !== 'object') return false;
  const msg = message as Record<string, unknown>;
  const type = msg.type as string;
  if (
    ![
      'JOIN_LOCAL',
      'JOIN_ROOM',
      'PEER_LIST',
      'PEER_JOINED',
      'PEER_LEFT',
      'SIGNAL',
      'ERROR',
    ].includes(type)
  ) {
    return false;
  }

  switch (type) {
    case 'JOIN_LOCAL':
      return isValidPeerMetadata(msg.peerInfo);
    case 'JOIN_ROOM':
      return (
        typeof msg.roomId === 'string' && isValidPeerMetadata(msg.peerInfo)
      );
    case 'SIGNAL':
      return (
        typeof msg.targetId === 'string' &&
        typeof msg.senderId === 'string' &&
        msg.signal !== undefined
      );
    case 'PEER_LIST':
      return Array.isArray(msg.peers);
    case 'PEER_JOINED':
      return isValidPeerMetadata(msg.peer);
    case 'PEER_LEFT':
      return typeof msg.peerId === 'string';
    default:
      return false;
  }
}

function getRoom(roomKey: string): Room {
  let room = rooms.get(roomKey);
  if (!room) {
    room = new Map();
    rooms.set(roomKey, room);
  }
  return room;
}

function removeRoomIfEmpty(roomKey: string): void {
  const room = rooms.get(roomKey);
  if (room && room.size === 0) {
    rooms.delete(roomKey);
  }
}

function send(ws: WebSocket, message: SignalingMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(ws: WebSocket, error: string): void {
  send(ws, { type: 'ERROR', error });
}

function broadcast(room: Room, message: SignalingMessage, excludePeerId: string): void {
  for (const [peerId, peer] of room) {
    if (peerId !== excludePeerId && peer.ws.readyState === WebSocket.OPEN) {
      send(peer.ws, message);
    }
  }
}

function handleJoinLocal(
  room: Room,
  ws: WebSocket & { peerId?: string; ipHash?: string },
  peerInfo: PeerMetadata
): void {
  const updatedPeerInfo: PeerMetadata = {
    ...peerInfo,
    ipHash: ws.ipHash ?? '',
    peerId: ws.peerId ?? '',
  };

  ws.peerId = updatedPeerInfo.peerId;
  room.set(ws.peerId, { ws, metadata: updatedPeerInfo });

  const peerList: PeerMetadata[] = [];
  for (const [, peer] of room) {
    if (peer.metadata && peer.metadata.peerId !== ws.peerId) {
      peerList.push(peer.metadata);
    }
  }

  send(ws, { type: 'PEER_LIST', peers: peerList });

  const joined: SignalingMessage = { type: 'PEER_JOINED', peer: updatedPeerInfo };
  broadcast(room, joined, ws.peerId);
}

function handleJoinRoom(
  room: Room,
  ws: WebSocket & { peerId?: string; ipHash?: string },
  _roomId: string,
  peerInfo: PeerMetadata
): void {
  const updatedPeerInfo: PeerMetadata = {
    ...peerInfo,
    ipHash: ws.ipHash ?? '',
    peerId: ws.peerId ?? '',
  };

  ws.peerId = updatedPeerInfo.peerId;
  room.set(ws.peerId, { ws, metadata: updatedPeerInfo });

  const peerList: PeerMetadata[] = [];
  for (const [, peer] of room) {
    if (peer.metadata && peer.metadata.peerId !== ws.peerId) {
      peerList.push(peer.metadata);
    }
  }

  send(ws, { type: 'PEER_LIST', peers: peerList });

  const joined: SignalingMessage = { type: 'PEER_JOINED', peer: updatedPeerInfo };
  broadcast(room, joined, ws.peerId);
}

function handleSignal(
  room: Room,
  ws: WebSocket & { peerId?: string },
  message: SignalingMessage
): void {
  if (message.type !== 'SIGNAL') return;

  const target = room.get(message.targetId);
  if (!target || target.ws.readyState !== WebSocket.OPEN) {
    sendError(ws, `Target peer ${message.targetId} not found or not connected`);
    return;
  }

  const forward: SignalingMessage = {
    type: 'SIGNAL',
    targetId: message.targetId,
    senderId: message.senderId,
    signal: message.signal,
  };
  send(target.ws, forward);
}

function handleClose(
  room: Room,
  ws: WebSocket & { peerId?: string; ipHash?: string }
): void {
  const peerId = ws.peerId;
  if (!peerId) return;

  const peer = room.get(peerId);
  if (peer) {
    const left: SignalingMessage = { type: 'PEER_LEFT', peerId };
    broadcast(room, left, peerId);
    room.delete(peerId);
  }
  removeRoomIfEmpty(roomKeyFromRoom(room));
}

function roomKeyFromRoom(room: Room): string {
  for (const [key, r] of rooms) {
    if (r === room) return key;
  }
  return '';
}

const PORT = Number(process.env.PORT) || 8080;

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

const wss = new WebSocketServer({ server, path: '/signaling' });

wss.on('connection', (ws, req) => {
  const ip = extractClientIp(
    req.headers ?? {},
    req.socket?.remoteAddress ?? null
  );
  const salt = getDailySalt();
  const ipHash = hashIp(ip, salt);

  const wsWithPeer = ws as WebSocket & { peerId?: string; ipHash?: string };
  wsWithPeer.peerId = generatePeerId();
  wsWithPeer.ipHash = ipHash;

  let currentRoom: Room | null = null;

  ws.on('message', (raw) => {
    let parsed: unknown;
    try {
      const text = typeof raw === 'string' ? raw : Buffer.from(new Uint8Array(raw as ArrayBuffer)).toString('utf8');
      parsed = JSON.parse(text);
    } catch {
      sendError(ws, 'Invalid JSON message');
      return;
    }

    if (!isValidSignalingMessage(parsed)) {
      sendError(ws, 'Invalid signaling message format');
      return;
    }

    switch (parsed.type) {
      case 'JOIN_LOCAL': {
        if (!isValidPeerMetadata(parsed.peerInfo)) {
          sendError(ws, 'Invalid peer metadata');
          return;
        }
        currentRoom = getRoom(`local-${ipHash}`);
        handleJoinLocal(currentRoom, wsWithPeer, parsed.peerInfo);
        break;
      }
      case 'JOIN_ROOM': {
        if (!isValidPeerMetadata(parsed.peerInfo) || typeof parsed.roomId !== 'string') {
          sendError(ws, 'Invalid JOIN_ROOM payload');
          return;
        }
        currentRoom = getRoom(parsed.roomId);
        handleJoinRoom(currentRoom, wsWithPeer, parsed.roomId, parsed.peerInfo);
        break;
      }
      case 'SIGNAL': {
        if (!currentRoom) {
          sendError(ws, 'Not joined to any room');
          return;
        }
        handleSignal(currentRoom, wsWithPeer, parsed);
        break;
      }
      default:
        sendError(ws, `Unsupported message type: ${parsed.type}`);
    }
  });

  ws.on('close', () => {
    if (currentRoom) {
      handleClose(currentRoom, wsWithPeer);
    }
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error for peer ${wsWithPeer.peerId}:`, err);
    if (currentRoom) {
      handleClose(currentRoom, wsWithPeer);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Signaling server listening on :${PORT}`);
});
