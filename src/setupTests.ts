// Test setup file - WebRTC polyfill for jsdom
import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Simple RTCPeerConnection polyfill for jsdom
class MockRTCPeerConnection {
  connectionState: RTCPeerConnectionState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';
  localDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescription | null = null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  onconnectionstatechange: ((event: Event) => void) | null = null;
  oniceconnectionstatechange: ((event: Event) => void) | null = null;
  ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null;
  onnegotiationneeded: (() => void) | null = null;
  onsignalingstatechange: (() => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;

  constructor(_config?: RTCConfiguration) {
    // Store config for inspection if needed
  }

  createDataChannel(label: string, options?: RTCDataChannelInit): RTCDataChannel {
    return new MockRTCDataChannel(label, options);
  }

  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = new RTCSessionDescription(description);
    return Promise.resolve();
  }

  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = new RTCSessionDescription(description);
    return Promise.resolve();
  }

  createOffer(_options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({ type: 'offer', sdp: '' });
  }

  createAnswer(_options?: RTCAnswerOptions): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({ type: 'answer', sdp: '' });
  }

  addIceCandidate(_candidate: RTCIceCandidateInit | RTCIceCandidate): Promise<void> {
    return Promise.resolve();
  }

  close(): void {
    this.onicecandidate = null;
    this.onconnectionstatechange = null;
    this.oniceconnectionstatechange = null;
    this.ondatachannel = null;
    this.onnegotiationneeded = null;
    this.onsignalingstatechange = null;
    this.ontrack = null;
  }

  getStats(): Promise<RTCStatsReport> {
    return Promise.resolve(new Map() as unknown as RTCStatsReport);
  }

  dispatchEvent(_event: Event): boolean {
    return true;
  }

  addEventListener(): void {}
  removeEventListener(): void {}
}

class MockRTCDataChannel {
  label: string;
  ordered: boolean;
  binaryType: BinaryType = 'arraybuffer';
  readyState: RTCDataChannelState = 'connecting';
  bufferedAmount: number = 0;
  bufferedAmountLowThreshold: number = 0;
  id: number = 0;
  maxPacketLifeTime: number | null = null;
  maxRetransmits: number | null = null;
  negotiated: boolean = false;
  protocol: string = '';
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  onclosing: ((event: Event) => void) | null = null;
  onerror: ((event: RTCErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onbufferedamountlow: ((event: Event) => void) | null = null;

  constructor(label: string, _options?: RTCDataChannelInit) {
    this.label = label;
    this.ordered = _options?.ordered ?? false;
    this.id = _options?.id ?? 0;
    this.maxPacketLifeTime = _options?.maxPacketLifeTime ?? null;
    this.maxRetransmits = _options?.maxRetransmits ?? null;
    this.negotiated = _options?.negotiated ?? false;
    this.protocol = _options?.protocol ?? '';
  }

  close(): void {
    this.readyState = 'closed';
    if (this.onclose) this.onclose(new Event('close'));
  }

  send(_data: string | Blob | ArrayBuffer | ArrayBufferView): void {
    // Mock send
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean { return true; }
}

class MockRTCIceCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment: string | null;

  constructor(init: RTCIceCandidateInit) {
    this.candidate = init.candidate || '';
    this.sdpMid = init.sdpMid ?? null;
    this.sdpMLineIndex = init.sdpMLineIndex ?? null;
    this.usernameFragment = init.usernameFragment ?? null;
  }

  toJSON(): RTCIceCandidateInit {
    return {
      candidate: this.candidate,
      sdpMid: this.sdpMid,
      sdpMLineIndex: this.sdpMLineIndex,
      usernameFragment: this.usernameFragment,
    };
  }
}

class MockRTCSessionDescription {
  type: RTCSdpType;
  sdp: string;

  constructor(init: RTCSessionDescriptionInit) {
    this.type = init.type;
    this.sdp = init.sdp || '';
  }

  toJSON(): RTCSessionDescriptionInit {
    return { type: this.type, sdp: this.sdp };
  }
}

// Install polyfills
vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnection);
vi.stubGlobal('RTCDataChannel', MockRTCDataChannel);
vi.stubGlobal('RTCIceCandidate', MockRTCIceCandidate);
vi.stubGlobal('RTCSessionDescription', MockRTCSessionDescription);

// Polyfill for window.matchMedia (jsdom doesn't have it)
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// jsdom doesn't implement Blob.prototype.arrayBuffer; polyfill it so
// File.prototype.slice() chunks (Blobs) can be read as ArrayBuffer in tests.
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (): void => {
        resolve(reader.result as ArrayBuffer);
      };
      reader.onerror = (): void => {
        reject(reader.error ?? new Error('Failed to read blob as ArrayBuffer'));
      };
      reader.readAsArrayBuffer(this);
    });
  };
}