export type PeerMetadata = {
  peerId: string;
  alias: string;
  deviceType: 'desktop' | 'mobile';
  os: string;
  browser: string;
  ipHash: string;
  joinedAt: number;
};

export type SignalingMessage =
  | { type: 'JOIN_LOCAL'; peerInfo: PeerMetadata }
  | { type: 'JOIN_ROOM'; roomId: string; peerInfo: PeerMetadata }
  | { type: 'PEER_LIST'; peers: PeerMetadata[] }
  | { type: 'PEER_JOINED'; peer: PeerMetadata }
  | { type: 'PEER_LEFT'; peerId: string }
  | { type: 'SIGNAL'; targetId: string; senderId: string; signal: RTCSessionDescriptionInit | RTCIceCandidateInit }
  | { type: 'ERROR'; error: string };

export type P2PControlMessage =
  | { type: 'TEXT_DROP'; text: string; senderId: string }
  | { type: 'TRANSFER_OFFER'; files: FileMeta[]; senderId: string }
  | { type: 'TRANSFER_ACCEPT'; fileId: string; receiverId: string }
  | { type: 'TRANSFER_DECLINE'; fileId: string; receiverId: string }
  | { type: 'FILE_COMPLETE'; fileId: string; receiverId: string };

export type FileMeta = {
  fileId: string;
  name: string;
  size: number;
  type: string;
  chunkCount: number;
};