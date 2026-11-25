import { useState, useEffect, useRef, useCallback } from 'react';
import { createSignalingClient, type SignalingClient, type SignalingMessage } from './core/signaling';
import { createPeerConnection, createDataChannel, type WebRTCCallbacks, type PeerConnectionState } from './core/webrtc';
import {
  sendControlMessage,
  receiveControlMessage,
  createTransferOffer,
  createTransferAccept,
  createTransferDecline,
  createFileComplete,
  type P2PControlMessage,
  type FileMeta,
} from './core/controlProtocol';
import { sendFile, receiveFile, type ProgressInfo } from './core/fileTransfer';
import type { PeerMetadata } from './core/types';

const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:8080/signaling';

type TransferDirection = 'sending' | 'receiving' | null;
type TransferState = {
  direction: TransferDirection;
  fileId: string | null;
  fileName: string | null;
  fileSize: number | null;
  progress: ProgressInfo | null;
  abortController: AbortController | null;
};

function App() {
  // Signaling
  const [signalingClient, setSignalingClient] = useState<SignalingClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [peers, setPeers] = useState<PeerMetadata[]>([]);
  const [localPeerId, setLocalPeerId] = useState<string>('');
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);

  // WebRTC
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const pcStateRef = useRef<PeerConnectionState>('new');
  const cleanupControlRef = useRef<(() => void) | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // Transfer
  const [transferState, setTransferState] = useState<TransferState>({
    direction: null,
    fileId: null,
    fileName: null,
    fileSize: null,
    progress: null,
    abortController: null,
  });

  // Local peer info (simplified for demo)
  const localPeerInfo: PeerMetadata = {
    peerId: `peer-${Math.random().toString(36).slice(2, 8)}`,
    alias: 'You',
    deviceType: 'desktop',
    os: navigator.platform,
    browser: navigator.userAgent.slice(0, 50),
    ipHash: 'local',
    joinedAt: Date.now(),
  };

  // Initialize signaling client
  useEffect(() => {
    const client = createSignalingClient(SIGNALING_URL);
    setSignalingClient(client);

    client.onMessage(handleSignalingMessage);

    client.connect()
      .then(() => {
        setIsConnected(true);
        setLocalPeerId(localPeerInfo.peerId);
        // Join local network
        client.send({ type: 'JOIN_LOCAL', peerInfo: localPeerInfo });
      })
      .catch((err) => {
        console.error('Signaling connection failed:', err);
      });

    return () => {
      client.close();
      setSignalingClient(null);
      setIsConnected(false);
    };
  }, []);

  // Handle incoming signaling messages
  const handleSignalingMessage = useCallback((msg: SignalingMessage) => {
    switch (msg.type) {
      case 'PEER_LIST':
        setPeers(msg.peers.filter((p: PeerMetadata) => p.peerId !== localPeerInfo.peerId));
        break;
      case 'PEER_JOINED':
        setPeers(prev => [...prev.filter(p => p.peerId !== msg.peer.peerId), msg.peer]);
        break;
      case 'PEER_LEFT':
        setPeers(prev => prev.filter(p => p.peerId !== msg.peerId));
        if (msg.peerId === selectedPeerId) {
          setSelectedPeerId(null);
          cleanupWebRTC();
        }
        break;
      case 'SIGNAL':
        if (msg.senderId === selectedPeerId) {
          handleIncomingSignal(msg.signal);
        }
        break;
      case 'ERROR':
        console.error('Signaling error:', msg.error);
        break;
    }
  }, [localPeerInfo.peerId, selectedPeerId]);

  // Handle incoming WebRTC signal (SDP offer/answer or ICE candidate)
  const handleIncomingSignal = useCallback(async (signal: RTCSessionDescriptionInit | RTCIceCandidateInit) => {
    const pc = pcRef.current;
    if (!pc) return;

    if ('sdp' in signal) {
      // SDP offer/answer
      const sessionDesc = signal as RTCSessionDescriptionInit;
      if (sessionDesc.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(sessionDesc));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signalingClient?.send({
          type: 'SIGNAL',
          targetId: selectedPeerId!,
          senderId: localPeerInfo.peerId,
          signal: pc.localDescription!,
        });
      } else if (sessionDesc.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(sessionDesc));
      }
    } else {
      // ICE candidate
      const iceCandidate = signal as RTCIceCandidateInit;
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(iceCandidate));
      } else {
        pendingIceCandidatesRef.current.push(iceCandidate);
      }
    }
  }, [selectedPeerId, localPeerInfo.peerId, signalingClient]);

  // Initialize WebRTC connection to selected peer
  const initiateConnection = useCallback(async (peerId: string) => {
    if (pcRef.current) {
      cleanupWebRTC();
    }

    setSelectedPeerId(peerId);

    const callbacks: WebRTCCallbacks = {
      onConnectionStateChange: (state) => {
        pcStateRef.current = state;
        console.log('PC state:', state);
      },
      onIceCandidate: (candidate) => {
        signalingClient?.send({
          type: 'SIGNAL',
          targetId: peerId,
          senderId: localPeerInfo.peerId,
          signal: candidate,
        });
      },
      onDataChannel: (channel) => {
        setupDataChannel(channel);
      },
      onIceConnectionStateChange: (state) => {
        console.log('ICE state:', state);
      },
      onError: (err) => {
        console.error('WebRTC error:', err);
      },
    };

    const pc = createPeerConnection(undefined, callbacks);
    pcRef.current = pc;

    // Create data channel
    const channel = createDataChannel(pc, 'file-transfer');
    setupDataChannel(channel);

    // Create offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    signalingClient?.send({
      type: 'SIGNAL',
      targetId: peerId,
      senderId: localPeerInfo.peerId,
      signal: pc.localDescription!,
    });
  }, [signalingClient, localPeerInfo.peerId]);

  // Set up data channel event handlers
  const setupDataChannel = useCallback((channel: RTCDataChannel) => {
    dataChannelRef.current = channel;
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      console.log('Data channel open');
    };

    channel.onclose = () => {
      console.log('Data channel closed');
      dataChannelRef.current = null;
    };

    channel.onerror = (err) => {
      console.error('Data channel error:', err);
    };

    // Set up control message handler
    if (cleanupControlRef.current) {
      cleanupControlRef.current();
    }
    cleanupControlRef.current = receiveControlMessage(channel, handleControlMessage);
  }, []);

  // Handle incoming control messages
  const handleControlMessage = useCallback((msg: P2PControlMessage) => {
    console.log('Received control message:', msg.type);

    switch (msg.type) {
      case 'TRANSFER_OFFER':
        handleTransferOffer(msg);
        break;
      case 'TRANSFER_ACCEPT':
        handleTransferAccept(msg);
        break;
      case 'TRANSFER_DECLINE':
        handleTransferDecline(msg);
        break;
      case 'FILE_COMPLETE':
        handleFileComplete(msg);
        break;
      case 'TEXT_DROP':
        console.log('Text drop received:', msg.text);
        break;
    }
  }, []);

  // Handle incoming transfer offer
  const handleTransferOffer = useCallback((msg: Extract<P2PControlMessage, { type: 'TRANSFER_OFFER' }>) => {
    if (msg.files.length === 0) return;

    const file = msg.files[0]; // Handle first file for now
    setTransferState({
      direction: 'receiving',
      fileId: file.fileId,
      fileName: file.name,
      fileSize: file.size,
      progress: { percentage: 0, speedMBps: 0, etaSeconds: 0, bytesTransferred: 0, totalBytes: file.size },
      abortController: new AbortController(),
    });

    // Auto-accept for demo (in real app, show confirmation dialog)
    const acceptMsg = createTransferAccept(file.fileId, localPeerInfo.peerId);
    sendControlMessage(dataChannelRef.current!, acceptMsg);

    // Start receiving
    if (dataChannelRef.current && transferState.abortController) {
      receiveFile(
        dataChannelRef.current,
        file.name,
        file.size,
        (progress) => {
          setTransferState(prev => ({ ...prev, progress }));
        }
      )
        .then((blob) => {
          console.log('File received:', blob.size, 'bytes');
          // Send FILE_COMPLETE
          const completeMsg = createFileComplete(file.fileId, localPeerInfo.peerId);
          sendControlMessage(dataChannelRef.current!, completeMsg);
          resetTransferState();
        })
        .catch((err) => {
          console.error('Receive error:', err);
          resetTransferState();
        });
    }
  }, [localPeerInfo.peerId, transferState.abortController]);

  // Handle transfer accepted by receiver
  const handleTransferAccept = useCallback((msg: Extract<P2PControlMessage, { type: 'TRANSFER_ACCEPT' }>) => {
    if (msg.fileId !== transferState.fileId) return;

    // Start sending the file
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    const file = fileInput?.files?.[0];
    if (!file || dataChannelRef.current === null) return;

    sendFile(
      dataChannelRef.current,
      file,
      {
        onProgress: (progress) => {
          setTransferState(prev => ({ ...prev, progress }));
        },
        onError: (err) => {
          console.error('Send error:', err);
          resetTransferState();
        },
      }
    )
      .then(() => {
        console.log('File sent successfully');
        // FILE_COMPLETE will be received from receiver
      })
      .catch((err) => {
        console.error('Send error:', err);
        resetTransferState();
      });
  }, [transferState.fileId]);

  // Handle transfer declined
  const handleTransferDecline = useCallback((msg: Extract<P2PControlMessage, { type: 'TRANSFER_DECLINE' }>) => {
    if (msg.fileId === transferState.fileId) {
      console.log('Transfer declined');
      resetTransferState();
    }
  }, [transferState.fileId]);

  // Handle file complete notification
  const handleFileComplete = useCallback((msg: Extract<P2PControlMessage, { type: 'FILE_COMPLETE' }>) => {
    if (msg.fileId === transferState.fileId) {
      console.log('Transfer complete confirmed');
      resetTransferState();
    }
  }, [transferState.fileId]);

  // Reset transfer state for next file
  const resetTransferState = useCallback(() => {
    setTransferState({
      direction: null,
      fileId: null,
      fileName: null,
      fileSize: null,
      progress: null,
      abortController: null,
    });
    // Clear file input
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  }, []);

  // Clean up WebRTC connection
  const cleanupWebRTC = useCallback(() => {
    if (cleanupControlRef.current) {
      cleanupControlRef.current();
      cleanupControlRef.current = null;
    }
    if (dataChannelRef.current) {
      dataChannelRef.current.onopen = null;
      dataChannelRef.current.onclose = null;
      dataChannelRef.current.onerror = null;
      dataChannelRef.current.onmessage = null;
      dataChannelRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    pcStateRef.current = 'new';
    pendingIceCandidatesRef.current = [];
    setSelectedPeerId(null);
    resetTransferState();
  }, [resetTransferState]);

  // Send file handler
  const handleSendFile = useCallback(() => {
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    const file = fileInput?.files?.[0];
    if (!file || !selectedPeerId || !dataChannelRef.current) return;

    const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const fileMeta: FileMeta = {
      fileId,
      name: file.name,
      size: file.size,
      type: file.type,
      chunkCount: Math.ceil(file.size / 65536),
    };

    setTransferState({
      direction: 'sending',
      fileId,
      fileName: file.name,
      fileSize: file.size,
      progress: { percentage: 0, speedMBps: 0, etaSeconds: 0, bytesTransferred: 0, totalBytes: file.size },
      abortController: new AbortController(),
    });

    const offerMsg = createTransferOffer([fileMeta], localPeerInfo.peerId);
    sendControlMessage(dataChannelRef.current, offerMsg);
  }, [selectedPeerId, localPeerInfo.peerId]);

  // Cancel transfer
  const handleCancelTransfer = useCallback(() => {
    if (transferState.abortController) {
      transferState.abortController.abort();
    }
    if (transferState.direction === 'sending' && transferState.fileId) {
      const declineMsg = createTransferDecline(transferState.fileId, localPeerInfo.peerId);
      sendControlMessage(dataChannelRef.current!, declineMsg);
    }
    resetTransferState();
  }, [transferState, localPeerInfo.peerId, resetTransferState]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono">
      <header className="border-b border-zinc-800 px-4 py-3">
        <h1 className="text-lg font-medium">Regex</h1>
        <p className="text-xs text-zinc-500">P2P File Transfer</p>
      </header>

      <main className="p-4 space-y-4 max-w-3xl mx-auto">
        {/* Connection Status */}
        <section className="rounded-lg border border-zinc-800 p-4">
          <h2 className="text-sm font-medium mb-3">Connection</h2>
          <div className="flex items-center gap-3 text-sm">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
            <span className="text-zinc-500">|</span>
            <span>Your ID: <span className="tabular-nums">{localPeerId.slice(0, 12)}</span></span>
          </div>
        </section>

        {/* Peer List */}
        <section className="rounded-lg border border-zinc-800 p-4">
          <h2 className="text-sm font-medium mb-3">Peers</h2>
          {peers.length === 0 ? (
            <p className="text-zinc-500 text-sm">No peers found. Waiting for others to join...</p>
          ) : (
            <ul className="space-y-2">
              {peers.map((peer) => (
                <li
                  key={peer.peerId}
                  className={`flex items-center justify-between p-2 rounded border ${
                    selectedPeerId === peer.peerId
                      ? 'border-green-500 bg-green-500/10'
                      : 'border-zinc-700 hover:border-zinc-600'
                  }`}
                >
                  <div>
                    <span className="font-medium">{peer.alias}</span>
                    <span className="text-zinc-500 ml-2 text-xs">({peer.peerId.slice(0, 8)})</span>
                  </div>
                  <button
                    onClick={() => initiateConnection(peer.peerId)}
                    disabled={selectedPeerId !== null}
                    className="px-3 py-1 text-xs rounded border border-zinc-600 hover:border-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {selectedPeerId === peer.peerId ? 'Connected' : 'Connect'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Transfer Controls */}
        <section className="rounded-lg border border-zinc-800 p-4">
          <h2 className="text-sm font-medium mb-3">File Transfer</h2>

          <input
            id="file-input"
            type="file"
            className="mb-3 block w-full text-sm text-zinc-400 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700"
            disabled={!selectedPeerId || transferState.direction !== null}
          />

          <div className="flex gap-2">
            <button
              onClick={handleSendFile}
              disabled={!selectedPeerId || transferState.direction !== null}
              className="px-4 py-2 text-sm rounded border border-zinc-600 hover:border-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send File
            </button>
            <button
              onClick={handleCancelTransfer}
              disabled={transferState.direction === null}
              className="px-4 py-2 text-sm rounded border border-red-500/50 text-red-400 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={cleanupWebRTC}
              disabled={selectedPeerId === null}
              className="px-4 py-2 text-sm rounded border border-zinc-600 hover:border-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
            >
              Disconnect
            </button>
          </div>
        </section>

        {/* Transfer Progress */}
        {transferState.direction !== null && (
          <section className="rounded-lg border border-zinc-800 p-4">
            <h2 className="text-sm font-medium mb-3">
              {transferState.direction === 'sending' ? 'Sending' : 'Receiving'}: {transferState.fileName}
            </h2>
            <div className="space-y-2">
              <div className="h-2 bg-zinc-800 rounded overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-100"
                  style={{ width: `${transferState.progress?.percentage ?? 0}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-zinc-400 tabular-nums">
                <span>{transferState.progress?.percentage?.toFixed(1) ?? 0}%</span>
                <span>{(transferState.progress?.speedMBps ?? 0).toFixed(2)} MB/s</span>
                <span>ETA: {Math.round(transferState.progress?.etaSeconds ?? 0)}s</span>
              </div>
              <div className="text-xs text-zinc-500 tabular-nums">
                {(transferState.progress?.bytesTransferred ?? 0) / 1024} KB / {(transferState.fileSize ?? 0) / 1024} KB
              </div>
            </div>
          </section>
        )}

        {/* Connection State */}
        {selectedPeerId && (
          <section className="rounded-lg border border-zinc-800 p-4 text-sm">
            <div className="flex justify-between text-zinc-400">
              <span>WebRTC State:</span>
              <span className="font-medium tabular-nums">{pcStateRef.current}</span>
            </div>
            <div className="flex justify-between text-zinc-400 mt-1">
              <span>Data Channel:</span>
              <span className="font-medium">{dataChannelRef.current?.readyState ?? 'closed'}</span>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;