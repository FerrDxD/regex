import { describe, it, expect } from 'vitest';
import type {
  PeerMetadata,
  SignalingMessage,
  P2PControlMessage,
  FileMeta,
} from './types';

describe('Signaling and P2P Control Types', () => {
  it('PeerMetadata has correct structure', () => {
    const peer: PeerMetadata = {
      peerId: 'peer-123',
      alias: 'Test User',
      deviceType: 'desktop',
      os: 'Windows 11',
      browser: 'Chrome 130',
      ipHash: 'sha256-hash-value',
      joinedAt: Date.now(),
    };

    expect(peer.peerId).toBe('peer-123');
    expect(peer.alias).toBe('Test User');
    expect(['desktop', 'mobile']).toContain(peer.deviceType);
    expect(typeof peer.joinedAt).toBe('number');
  });

  it('SignalingMessage JOIN_LOCAL has correct structure', () => {
    const msg: SignalingMessage = {
      type: 'JOIN_LOCAL',
      peerInfo: {
        peerId: 'peer-123',
        alias: 'Test User',
        deviceType: 'desktop',
        os: 'Windows 11',
        browser: 'Chrome 130',
        ipHash: 'sha256-hash-value',
        joinedAt: Date.now(),
      },
    };

    expect(msg.type).toBe('JOIN_LOCAL');
    expect(msg.peerInfo.peerId).toBe('peer-123');
  });

  it('SignalingMessage JOIN_ROOM has correct structure', () => {
    const msg: SignalingMessage = {
      type: 'JOIN_ROOM',
      roomId: 'room-abc',
      peerInfo: {
        peerId: 'peer-123',
        alias: 'Test User',
        deviceType: 'mobile',
        os: 'iOS 18',
        browser: 'Safari 18',
        ipHash: 'sha256-hash-value',
        joinedAt: Date.now(),
      },
    };

    expect(msg.type).toBe('JOIN_ROOM');
    expect(msg.roomId).toBe('room-abc');
  });

  it('SignalingMessage PEER_LIST has correct structure', () => {
    const msg: SignalingMessage = {
      type: 'PEER_LIST',
      peers: [
        {
          peerId: 'peer-1',
          alias: 'User 1',
          deviceType: 'desktop',
          os: 'Windows 11',
          browser: 'Chrome 130',
          ipHash: 'hash-1',
          joinedAt: Date.now(),
        },
        {
          peerId: 'peer-2',
          alias: 'User 2',
          deviceType: 'mobile',
          os: 'Android 15',
          browser: 'Chrome 130',
          ipHash: 'hash-2',
          joinedAt: Date.now(),
        },
      ],
    };

    expect(msg.type).toBe('PEER_LIST');
    expect(msg.peers).toHaveLength(2);
  });

  it('SignalingMessage PEER_JOINED has correct structure', () => {
    const msg: SignalingMessage = {
      type: 'PEER_JOINED',
      peer: {
        peerId: 'peer-456',
        alias: 'New User',
        deviceType: 'desktop',
        os: 'macOS 15',
        browser: 'Safari 18',
        ipHash: 'sha256-hash-value',
        joinedAt: Date.now(),
      },
    };

    expect(msg.type).toBe('PEER_JOINED');
    expect(msg.peer.peerId).toBe('peer-456');
  });

  it('SignalingMessage PEER_LEFT has correct structure', () => {
    const msg: SignalingMessage = {
      type: 'PEER_LEFT',
      peerId: 'peer-123',
    };

    expect(msg.type).toBe('PEER_LEFT');
    expect(msg.peerId).toBe('peer-123');
  });

  it('SignalingMessage SIGNAL with RTCSessionDescriptionInit has correct structure', () => {
    const msg: SignalingMessage = {
      type: 'SIGNAL',
      targetId: 'peer-456',
      senderId: 'peer-123',
      signal: { type: 'offer', sdp: 'sdp-data' } as RTCSessionDescriptionInit,
    };

    expect(msg.type).toBe('SIGNAL');
    expect(msg.targetId).toBe('peer-456');
    expect(msg.senderId).toBe('peer-123');
    expect('type' in msg.signal && msg.signal.type === 'offer').toBe(true);
  });

  it('SignalingMessage SIGNAL with RTCIceCandidateInit has correct structure', () => {
    const msg: SignalingMessage = {
      type: 'SIGNAL',
      targetId: 'peer-456',
      senderId: 'peer-123',
      signal: { candidate: 'candidate-data', sdpMid: '0', sdpMLineIndex: 0 } as RTCIceCandidateInit,
    };

    expect(msg.type).toBe('SIGNAL');
    expect('candidate' in msg.signal).toBe(true);
  });

  it('P2PControlMessage TEXT_DROP has correct structure', () => {
    const msg: P2PControlMessage = {
      type: 'TEXT_DROP',
      text: 'Hello, World!',
      senderId: 'peer-123',
    };

    expect(msg.type).toBe('TEXT_DROP');
    expect(msg.text).toBe('Hello, World!');
    expect(msg.senderId).toBe('peer-123');
  });

  it('P2PControlMessage TRANSFER_OFFER has correct structure', () => {
    const msg: P2PControlMessage = {
      type: 'TRANSFER_OFFER',
      files: [
        {
          fileId: 'file-1',
          name: 'document.pdf',
          size: 1024000,
          type: 'application/pdf',
          chunkCount: 16,
        },
      ],
      senderId: 'peer-123',
    };

    expect(msg.type).toBe('TRANSFER_OFFER');
    expect(msg.files).toHaveLength(1);
    expect(msg.files[0].fileId).toBe('file-1');
    expect(msg.files[0].chunkCount).toBe(16);
  });

  it('P2PControlMessage TRANSFER_ACCEPT has correct structure', () => {
    const msg: P2PControlMessage = {
      type: 'TRANSFER_ACCEPT',
      fileId: 'file-1',
      receiverId: 'peer-456',
    };

    expect(msg.type).toBe('TRANSFER_ACCEPT');
    expect(msg.fileId).toBe('file-1');
    expect(msg.receiverId).toBe('peer-456');
  });

  it('P2PControlMessage TRANSFER_DECLINE has correct structure', () => {
    const msg: P2PControlMessage = {
      type: 'TRANSFER_DECLINE',
      fileId: 'file-1',
      receiverId: 'peer-456',
    };

    expect(msg.type).toBe('TRANSFER_DECLINE');
    expect(msg.fileId).toBe('file-1');
    expect(msg.receiverId).toBe('peer-456');
  });

  it('P2PControlMessage FILE_COMPLETE has correct structure', () => {
    const msg: P2PControlMessage = {
      type: 'FILE_COMPLETE',
      fileId: 'file-1',
      receiverId: 'peer-456',
    };

    expect(msg.type).toBe('FILE_COMPLETE');
    expect(msg.fileId).toBe('file-1');
    expect(msg.receiverId).toBe('peer-456');
  });

  it('FileMeta has correct structure', () => {
    const file: FileMeta = {
      fileId: 'file-123',
      name: 'image.png',
      size: 2048576,
      type: 'image/png',
      chunkCount: 32,
    };

    expect(file.fileId).toBe('file-123');
    expect(file.name).toBe('image.png');
    expect(file.size).toBe(2048576);
    expect(file.type).toBe('image/png');
    expect(file.chunkCount).toBe(32);
  });
});