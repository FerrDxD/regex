import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createPeerConnection,
  createDataChannel,
  type WebRTCConfig,
  type PeerConnectionState,
  type WebRTCCallbacks,
} from './webrtc';

function setConnectionState(pc: RTCPeerConnection, state: RTCPeerConnectionState): void {
  Object.defineProperty(pc, 'connectionState', { value: state, writable: true, configurable: true });
}

function setIceConnectionState(pc: RTCPeerConnection, state: RTCIceConnectionState): void {
  Object.defineProperty(pc, 'iceConnectionState', { value: state, writable: true, configurable: true });
}

describe('WebRTC Connection Manager', () => {
  let callbacks: WebRTCCallbacks;

  beforeEach(() => {
    vi.clearAllMocks();
    callbacks = {
      onConnectionStateChange: vi.fn(),
      onIceCandidate: vi.fn(),
      onDataChannel: vi.fn(),
      onIceConnectionStateChange: vi.fn(),
      onError: vi.fn(),
    };
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createPeerConnection', () => {
    it('creates a peer connection with default STUN servers', () => {
      const pc = createPeerConnection(undefined, callbacks);

      expect(pc).toBeDefined();
      expect(pc).toBeInstanceOf(RTCPeerConnection);
    });

    it('merges custom config with defaults', () => {
      const customConfig: WebRTCConfig = {
        iceServers: [{ urls: 'stun:custom.example.com:3478' }],
        iceTransportPolicy: 'relay',
        bundlePolicy: 'max-compat',
      };

      const pc = createPeerConnection(customConfig, callbacks);

      expect(pc).toBeDefined();
      expect(pc).toBeInstanceOf(RTCPeerConnection);
    });

    it('wires onicecandidate callback', () => {
      const pc = createPeerConnection(undefined, callbacks);
      const mockCandidate = { candidate: 'candidate:123', sdpMid: '0', sdpMLineIndex: 0 };
      const mockEvent = { candidate: { toJSON: () => mockCandidate } } as RTCPeerConnectionIceEvent;

      if (pc.onicecandidate) {
        pc.onicecandidate(mockEvent);
      }

      expect(callbacks.onIceCandidate).toHaveBeenCalledWith(mockCandidate);
    });

    it('does not call onIceCandidate when candidate is null', () => {
      const pc = createPeerConnection(undefined, callbacks);
      const mockEvent = { candidate: null } as RTCPeerConnectionIceEvent;

      if (pc.onicecandidate) {
        pc.onicecandidate(mockEvent);
      }

      expect(callbacks.onIceCandidate).not.toHaveBeenCalled();
    });

    it('maps connection state changes to PeerConnectionState', () => {
      const pc = createPeerConnection(undefined, callbacks);

      const states: Array<[RTCPeerConnectionState, PeerConnectionState]> = [
        ['new', 'new'],
        ['connecting', 'connecting'],
        ['connected', 'connected'],
        ['failed', 'failed'],
        ['closed', 'closed'],
        ['disconnected', 'disconnected'],
      ];

      for (const [rtcState, expectedState] of states) {
        setConnectionState(pc, rtcState);
        if (pc.onconnectionstatechange) {
          pc.onconnectionstatechange(new Event('connectionstatechange'));
        }
        expect(callbacks.onConnectionStateChange).toHaveBeenCalledWith(expectedState);
      }
    });

    it('wires oniceconnectionstatechange callback', () => {
      const pc = createPeerConnection(undefined, callbacks);
      setIceConnectionState(pc, 'checking');

      if (pc.oniceconnectionstatechange) {
        pc.oniceconnectionstatechange(new Event('iceconnectionstatechange'));
      }

      expect(callbacks.onIceConnectionStateChange).toHaveBeenCalledWith('checking');
    });

    it('calls onError when iceConnectionState becomes failed', () => {
      const pc = createPeerConnection(undefined, callbacks);
      setIceConnectionState(pc, 'failed');

      if (pc.oniceconnectionstatechange) {
        pc.oniceconnectionstatechange(new Event('iceconnectionstatechange'));
      }

      expect(callbacks.onIceConnectionStateChange).toHaveBeenCalledWith('failed');
      expect(callbacks.onError).toHaveBeenCalledWith(expect.any(Error));
      expect(callbacks.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'ICE connection failed' }));
    });

    it('wires ondatachannel callback', () => {
      const pc = createPeerConnection(undefined, callbacks);
      const mockChannel = pc.createDataChannel('test');
      const mockEvent = { channel: mockChannel } as RTCDataChannelEvent;

      if (pc.ondatachannel) {
        pc.ondatachannel(mockEvent);
      }

      expect(callbacks.onDataChannel).toHaveBeenCalledWith(mockChannel);
    });
  });

  describe('createDataChannel', () => {
    it('creates a data channel with ordered: true', () => {
      const pc = createPeerConnection(undefined, callbacks);
      const channel = createDataChannel(pc, 'test-label');

      expect(channel).toBeDefined();
      expect(channel.label).toBe('test-label');
    });

    it('sets binaryType to arraybuffer', () => {
      const pc = createPeerConnection(undefined, callbacks);
      const channel = createDataChannel(pc, 'test-label');

      expect(channel.binaryType).toBe('arraybuffer');
    });

    it('returns the created data channel', () => {
      const pc = createPeerConnection(undefined, callbacks);
      const channel = createDataChannel(pc, 'test-label');

      expect(channel).toBeInstanceOf(RTCDataChannel);
    });
  });

  describe('cleanup on close', () => {
    it('sets all event handlers to null when pc.close() is called', () => {
      const pc = createPeerConnection(undefined, callbacks);

      pc.close();

      expect(pc.onicecandidate).toBeNull();
      expect(pc.onconnectionstatechange).toBeNull();
      expect(pc.oniceconnectionstatechange).toBeNull();
      expect(pc.ondatachannel).toBeNull();
    });
  });

  describe('type exports', () => {
    it('exports WebRTCConfig type', () => {
      const config: WebRTCConfig = {
        iceServers: [{ urls: 'stun:test.com' }],
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
      };
      expect(config).toBeDefined();
    });

    it('exports PeerConnectionState type', () => {
      const states: PeerConnectionState[] = ['new', 'connecting', 'connected', 'failed', 'closed', 'disconnected'];
      expect(states).toHaveLength(6);
    });

    it('exports WebRTCCallbacks type', () => {
      const cb: WebRTCCallbacks = {
        onConnectionStateChange: (state) => state,
        onIceCandidate: (candidate) => candidate,
        onDataChannel: (channel) => channel,
        onIceConnectionStateChange: (state) => state,
        onError: (error) => error,
      };
      expect(cb).toBeDefined();
    });
  });
});