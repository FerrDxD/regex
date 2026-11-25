export type WebRTCConfig = {
  iceServers: RTCIceServer[];
  iceTransportPolicy?: RTCIceTransportPolicy;
  bundlePolicy?: RTCBundlePolicy;
};

export type PeerConnectionState = 'new' | 'connecting' | 'connected' | 'failed' | 'closed' | 'disconnected';

export type WebRTCCallbacks = {
  onConnectionStateChange?: (state: PeerConnectionState) => void;
  onIceCandidate?: (candidate: RTCIceCandidateInit) => void;
  onDataChannel?: (channel: RTCDataChannel) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
  onError?: (error: Error) => void;
};

const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

function mapConnectionState(state: RTCPeerConnectionState): PeerConnectionState {
  switch (state) {
    case 'new':
      return 'new';
    case 'connecting':
      return 'connecting';
    case 'connected':
      return 'connected';
    case 'failed':
      return 'failed';
    case 'closed':
      return 'closed';
    case 'disconnected':
      return 'disconnected';
    default:
      return 'new';
  }
}

export function createPeerConnection(config?: WebRTCConfig, callbacks?: WebRTCCallbacks): RTCPeerConnection {
  const mergedConfig: RTCConfiguration = {
    iceServers: config?.iceServers ?? DEFAULT_STUN_SERVERS,
    iceTransportPolicy: config?.iceTransportPolicy ?? 'all',
    bundlePolicy: config?.bundlePolicy ?? 'max-bundle',
  };

  const pc = new RTCPeerConnection(mergedConfig);

  const handleIceCandidate = (event: RTCPeerConnectionIceEvent): void => {
    if (event.candidate && callbacks?.onIceCandidate) {
      callbacks.onIceCandidate(event.candidate.toJSON());
    }
  };

  const handleConnectionStateChange = (): void => {
    if (callbacks?.onConnectionStateChange) {
      callbacks.onConnectionStateChange(mapConnectionState(pc.connectionState));
    }
  };

  const handleIceConnectionStateChange = (): void => {
    if (callbacks?.onIceConnectionStateChange) {
      callbacks.onIceConnectionStateChange(pc.iceConnectionState);
    }
    if (pc.iceConnectionState === 'failed' && callbacks?.onError) {
      callbacks.onError(new Error('ICE connection failed'));
    }
  };

  const handleDataChannel = (event: RTCDataChannelEvent): void => {
    if (callbacks?.onDataChannel) {
      callbacks.onDataChannel(event.channel);
    }
  };

  pc.onicecandidate = handleIceCandidate;
  pc.onconnectionstatechange = handleConnectionStateChange;
  pc.oniceconnectionstatechange = handleIceConnectionStateChange;
  pc.ondatachannel = handleDataChannel;

  const originalClose = pc.close.bind(pc);
  pc.close = (): void => {
    pc.onicecandidate = null;
    pc.onconnectionstatechange = null;
    pc.oniceconnectionstatechange = null;
    pc.ondatachannel = null;
    originalClose();
  };

  return pc;
}

export function createDataChannel(pc: RTCPeerConnection, label: string): RTCDataChannel {
  const channel = pc.createDataChannel(label, { ordered: true });
  channel.binaryType = 'arraybuffer';
  return channel;
}