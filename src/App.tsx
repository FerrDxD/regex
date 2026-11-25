import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { QrCode, FileText, Upload, X } from 'lucide-react';
import { createSignalingClient, type SignalingClient, type SignalingMessage } from './core/signaling';
import { createPeerConnection, createDataChannel, type WebRTCCallbacks, type PeerConnectionState } from './core/webrtc';
import {
  sendControlMessage,
  receiveControlMessage,
  createTransferOffer,
  createTransferAccept,
  createTransferDecline,
  createFileComplete,
  createTextDrop,
  type P2PControlMessage,
  type FileMeta,
} from './core/controlProtocol';
import { sendFile, receiveFile, CHUNK_SIZE } from './core/fileTransfer';
import type { PeerMetadata } from './core/types';
import { RadarView } from './components/RadarView';
import { QrPairingModal } from './components/QrPairingModal';
import { TransferSheet } from './components/TransferSheet';
import { InstantTextBox } from './components/InstantTextBox';
import { DragDropOverlay } from './components/DragDropOverlay';
import { useSessionStore } from './store/useSessionStore';

const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:8080/signaling';

function App() {
  // Signaling
  const [_signalingClient, setSignalingClient] = useState<SignalingClient | null>(null);
  const signalingClientRef = useRef<SignalingClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [localPeerId, setLocalPeerId] = useState<string>('');

  // Store selectors
  const selectedPeerId = useSessionStore((state) => state.selectedPeerId);
  const transferState = useSessionStore((state) => state.transferState);

  const setPeers = useSessionStore((state) => state.setPeers);
  const addPeer = useSessionStore((state) => state.addPeer);
  const removePeer = useSessionStore((state) => state.removePeer);
  const setSelectedPeer = useSessionStore((state) => state.setSelectedPeer);
  const setConnectionStatus = useSessionStore((state) => state.setConnectionStatus);
  const setTransferState = useSessionStore((state) => state.setTransferState);
  const resetTransferState = useSessionStore((state) => state.resetTransferState);
  const openQrModal = useSessionStore((state) => state.openQrModal);
  const closeQrModal = useSessionStore((state) => state.closeQrModal);
  const setDragDropActive = useSessionStore((state) => state.setDragDropActive);
  const setClipboardText = useSessionStore((state) => state.setClipboardText);

  // WebRTC
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const pcStateRef = useRef<PeerConnectionState>('new');
  const cleanupControlRef = useRef<(() => void) | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // Transfer - handler refs to avoid stale closures
  const handleTransferOfferRef = useRef<((msg: Extract<P2PControlMessage, { type: 'TRANSFER_OFFER' }>) => void) | null>(null);
  const handleTransferAcceptRef = useRef<((msg: Extract<P2PControlMessage, { type: 'TRANSFER_ACCEPT' }>) => void) | null>(null);
  const handleTransferDeclineRef = useRef<((msg: Extract<P2PControlMessage, { type: 'TRANSFER_DECLINE' }>) => void) | null>(null);
  const handleFileCompleteRef = useRef<((msg: Extract<P2PControlMessage, { type: 'FILE_COMPLETE' }>) => void) | null>(null);

  // Local peer info (simplified for demo)
  const localPeerInfo: PeerMetadata = useMemo(() => ({
    peerId: `peer-${Math.random().toString(36).slice(2, 8)}`,
    alias: 'You',
    deviceType: 'desktop',
    os: navigator.platform,
    browser: navigator.userAgent.slice(0, 50),
    ipHash: 'local',
    joinedAt: Date.now(),
  }), []);

  // Generate room ID for QR pairing (local state, not in store)
  const roomId = useMemo(() => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'RX-';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }, []);

  // Handler refs for signaling (to avoid stale closures) - use mutable object wrapper
  const handleSignalingMessageRef = useRef<{ current: ((msg: SignalingMessage) => void) | null }>({ current: null });
  const handleIncomingSignalRef = useRef<{ current: ((signal: RTCSessionDescriptionInit | RTCIceCandidateInit) => Promise<void>) | null }>({ current: null });

  // Initialize signaling client
  useEffect(() => {
    const client = createSignalingClient(SIGNALING_URL);
    setSignalingClient(client);
    signalingClientRef.current = client;

    // Register single message callback that dispatches through ref
    client.onMessage((msg) => {
      handleSignalingMessageRef.current.current?.(msg);
    });

    client.connect()
      .then(() => {
        setIsConnected(true);
        setLocalPeerId(localPeerInfo.peerId);
        setConnectionStatus('connected');
        // Join local network
        client.send({ type: 'JOIN_LOCAL', peerInfo: localPeerInfo });
      })
      .catch((err) => {
        console.error('Signaling connection failed:', err);
        setConnectionStatus('error');
      });

    return () => {
      cleanupWebRTC();
      client.close();
      signalingClientRef.current = null;
      setSignalingClient(null);
      setIsConnected(false);
      setConnectionStatus('searching');
    };
  }, [localPeerInfo, setConnectionStatus]);

  // Handle incoming signaling messages (updates ref for live access)
  const handleSignalingMessage = useCallback((_msg: SignalingMessage) => {
    switch (_msg.type) {
      case 'PEER_LIST':
        setPeers(_msg.peers.filter((p: PeerMetadata) => p.peerId !== localPeerInfo.peerId));
        break;
      case 'PEER_JOINED':
        addPeer(_msg.peer);
        break;
      case 'PEER_LEFT':
        removePeer(_msg.peerId);
        if (_msg.peerId === selectedPeerId) {
          setSelectedPeer(null);
          cleanupWebRTC();
        }
        break;
      case 'SIGNAL':
        if (_msg.senderId === selectedPeerId) {
          handleIncomingSignalRef.current.current?.(_msg.signal);
        }
        break;
      case 'ERROR':
        console.error('Signaling error:', _msg.error);
        break;
    }
  }, [localPeerInfo.peerId, selectedPeerId, setPeers, addPeer, removePeer, setSelectedPeer]);

  // Keep ref updated
  handleSignalingMessageRef.current.current = handleSignalingMessage;

  // Helper to flush pending ICE candidates
  const flushPendingIceCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || pendingIceCandidatesRef.current.length === 0) return;
    for (const candidate of pendingIceCandidatesRef.current) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Failed to add pending ICE candidate:', err);
      }
    }
    pendingIceCandidatesRef.current = [];
  }, []);

  // Handle incoming WebRTC signal (SDP offer/answer or ICE candidate)
  const handleIncomingSignal = useCallback(async (signal: RTCSessionDescriptionInit | RTCIceCandidateInit) => {
    const pc = pcRef.current;
    if (!pc) return;

    if ('sdp' in signal) {
      // SDP offer/answer
      const sessionDesc = signal as RTCSessionDescriptionInit;
      if (sessionDesc.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(sessionDesc));
        await flushPendingIceCandidates();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await flushPendingIceCandidates();
        signalingClientRef.current?.send({
          type: 'SIGNAL',
          targetId: selectedPeerId!,
          senderId: localPeerInfo.peerId,
          signal: pc.localDescription!,
        });
      } else if (sessionDesc.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(sessionDesc));
        await flushPendingIceCandidates();
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
  }, [selectedPeerId, localPeerInfo.peerId, flushPendingIceCandidates]);

  // Initialize WebRTC connection to selected peer
  const initiateConnection = useCallback(async (peerId: string) => {
    if (pcRef.current) {
      cleanupWebRTC();
    }

    setSelectedPeer(peerId);
    setConnectionStatus('handshaking');

    const callbacks: WebRTCCallbacks = {
      onConnectionStateChange: (state) => {
        pcStateRef.current = state;
        console.log('PC state:', state);
      },
      onIceCandidate: (candidate) => {
        signalingClientRef.current?.send({
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
    await flushPendingIceCandidates();

    signalingClientRef.current?.send({
      type: 'SIGNAL',
      targetId: peerId,
      senderId: localPeerInfo.peerId,
      signal: pc.localDescription!,
    });
  }, [localPeerInfo.peerId, flushPendingIceCandidates, setSelectedPeer, setConnectionStatus]);

  // Set up data channel event handlers
  const setupDataChannel = useCallback((channel: RTCDataChannel) => {
    dataChannelRef.current = channel;
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      console.log('Data channel open');
      setConnectionStatus('connected');
    };

    channel.onclose = () => {
      console.log('Data channel closed');
      dataChannelRef.current = null;
      setConnectionStatus('searching');
    };

    channel.onerror = (err) => {
      console.error('Data channel error:', err);
    };

    // Set up control message handler
    if (cleanupControlRef.current) {
      cleanupControlRef.current();
    }
    cleanupControlRef.current = receiveControlMessage(channel, handleControlMessage);
  }, [setConnectionStatus]);

  // Handle incoming control messages - dispatches to refs to avoid stale closures
  const handleControlMessage = useCallback((msg: P2PControlMessage) => {
    console.log('Received control message:', msg.type);

    switch (msg.type) {
      case 'TRANSFER_OFFER':
        handleTransferOfferRef.current?.(msg);
        break;
      case 'TRANSFER_ACCEPT':
        handleTransferAcceptRef.current?.(msg);
        break;
      case 'TRANSFER_DECLINE':
        handleTransferDeclineRef.current?.(msg);
        break;
      case 'FILE_COMPLETE':
        handleFileCompleteRef.current?.(msg);
        break;
      case 'TEXT_DROP':
        console.log('Text drop received:', msg.text);
        break;
    }
  }, []);

  // Reset transfer state for next file (must be before handlers that use it)
  const handleResetTransferState = useCallback(() => {
    resetTransferState();
    // Clear file input
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  }, [resetTransferState]);

  // Handle incoming transfer offer - set transfer state for TransferSheet
  const handleTransferOffer = useCallback((msg: Extract<P2PControlMessage, { type: 'TRANSFER_OFFER' }>) => {
    if (msg.files.length === 0) return;

    const file = msg.files[0]; // Handle first file for now
    const abortController = new AbortController();
    setTransferState({
      direction: 'receiving',
      fileId: file.fileId,
      fileName: file.name,
      fileSize: file.size,
      progress: { percentage: 0, speedMBps: 0, etaSeconds: 0, bytesTransferred: 0, totalBytes: file.size },
      abortController,
    });
    // Do NOT auto-accept; TransferSheet will render and user must click Accept
  }, [setTransferState]);

  // Handle transfer accepted by receiver
  const handleTransferAccept = useCallback((_msg: Extract<P2PControlMessage, { type: 'TRANSFER_ACCEPT' }>) => {
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    const file = fileInput?.files?.[0];
    if (!file || dataChannelRef.current === null) return;

    sendFile(
      dataChannelRef.current,
      file,
      {
        onProgress: (progress) => {
          const current = useSessionStore.getState().transferState;
          if (current) setTransferState({ ...current, progress });
        },
        onError: (err) => {
          console.error('Send error:', err);
          handleResetTransferState();
        },
      }
    )
      .then(() => {
        console.log('File sent successfully');
        // FILE_COMPLETE will be received from receiver
      })
      .catch((err) => {
        console.error('Send error:', err);
        handleResetTransferState();
      });
  }, [setTransferState, handleResetTransferState]);

  // Handle transfer declined
  const handleTransferDecline = useCallback((_msg: Extract<P2PControlMessage, { type: 'TRANSFER_DECLINE' }>) => {
    console.log('Transfer declined');
    handleResetTransferState();
  }, [handleResetTransferState]);

  // Handle file complete notification
  const handleFileComplete = useCallback((_msg: Extract<P2PControlMessage, { type: 'FILE_COMPLETE' }>) => {
    console.log('Transfer complete confirmed');
    handleResetTransferState();
  }, [handleResetTransferState]);

  // Keep handler refs updated to latest versions
  handleTransferOfferRef.current = handleTransferOffer;
  handleTransferAcceptRef.current = handleTransferAccept;
  handleTransferDeclineRef.current = handleTransferDecline;
  handleFileCompleteRef.current = handleFileComplete;
  handleIncomingSignalRef.current.current = handleIncomingSignal;

  // Initiate WebRTC connection when selectedPeerId changes
  useEffect(() => {
    if (selectedPeerId) {
      initiateConnection(selectedPeerId);
    }
  }, [selectedPeerId, initiateConnection]);

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
    setSelectedPeer(null);
    handleResetTransferState();
  }, [setSelectedPeer, handleResetTransferState]);

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
      chunkCount: Math.ceil(file.size / CHUNK_SIZE),
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
  }, [selectedPeerId, localPeerInfo.peerId, setTransferState]);

  // Handle file drop from DragDropOverlay
  const handleDrop = useCallback((files: File[]) => {
    if (files.length === 0 || !selectedPeerId || !dataChannelRef.current) return;
    const file = files[0];

    const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const fileMeta: FileMeta = {
      fileId,
      name: file.name,
      size: file.size,
      type: file.type,
      chunkCount: Math.ceil(file.size / CHUNK_SIZE),
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
    setDragDropActive(false);
  }, [selectedPeerId, localPeerInfo.peerId, setTransferState, setDragDropActive]);

  // Handle text send from InstantTextBox
  const handleSendText = useCallback((text: string) => {
    if (!selectedPeerId || !dataChannelRef.current) return;
    const textMsg = createTextDrop(text, localPeerInfo.peerId);
    sendControlMessage(dataChannelRef.current, textMsg);
  }, [selectedPeerId, localPeerInfo.peerId]);

  // TransferSheet handlers
  const handleTransferSheetAccept = useCallback(() => {
    // Called when user clicks "Accept" on incoming transfer
    if (!transferState || transferState.direction !== 'receiving' || !transferState.fileId || !dataChannelRef.current) return;
    const acceptMsg = createTransferAccept(transferState.fileId, localPeerInfo.peerId);
    sendControlMessage(dataChannelRef.current, acceptMsg);

    // Start receiving - use local abortController const
    if (dataChannelRef.current && transferState.fileName && transferState.fileSize !== null) {
      receiveFile(
        dataChannelRef.current,
        transferState.fileName,
        transferState.fileSize,
        (progress) => {
          const current = useSessionStore.getState().transferState;
          if (current) setTransferState({ ...current, progress });
        }
      )
        .then((blob) => {
          console.log('File received:', blob.size, 'bytes');
          // Send FILE_COMPLETE
          const completeMsg = createFileComplete(transferState.fileId!, localPeerInfo.peerId);
          sendControlMessage(dataChannelRef.current!, completeMsg);
          handleResetTransferState();
        })
        .catch((err) => {
          console.error('Receive error:', err);
          handleResetTransferState();
        });
    }
  }, [transferState, localPeerInfo.peerId, setTransferState, handleResetTransferState]);

  const handleTransferSheetDecline = useCallback(() => {
    // Called when user clicks "Decline" on incoming transfer
    if (!transferState || transferState.direction !== 'receiving' || !transferState.fileId || !dataChannelRef.current) return;
    const declineMsg = createTransferDecline(transferState.fileId, localPeerInfo.peerId);
    sendControlMessage(dataChannelRef.current, declineMsg);
    handleResetTransferState();
  }, [transferState, localPeerInfo.peerId, handleResetTransferState]);

  const handleTransferSheetCancel = useCallback(() => {
    // Called when user clicks "Cancel" during active transfer
    if (!transferState || !dataChannelRef.current) return;
    if (transferState.abortController) {
      transferState.abortController.abort();
    }
    if (transferState.direction === 'sending' && transferState.fileId) {
      const declineMsg = createTransferDecline(transferState.fileId, localPeerInfo.peerId);
      sendControlMessage(dataChannelRef.current, declineMsg);
    }
    handleResetTransferState();
  }, [transferState, localPeerInfo.peerId, handleResetTransferState]);

  // Global paste handler (Ctrl/Cmd + V)
  useEffect(() => {
    const handlePaste = async (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifierPressed = isMac ? event.metaKey : event.ctrlKey;

      if (modifierPressed && event.key === 'v') {
        // Only trigger if not focused on an input/textarea
        const activeElement = document.activeElement;
        const isInputFocused = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement;

        if (!isInputFocused && selectedPeerId && dataChannelRef.current) {
          try {
            const text = await navigator.clipboard.readText();
            if (text.trim()) {
              const textMsg = createTextDrop(text, localPeerInfo.peerId);
              sendControlMessage(dataChannelRef.current, textMsg);
              setClipboardText(text);
            }
          } catch (err) {
            console.warn('Clipboard read failed:', err);
          }
        }
      }
    };

    window.addEventListener('keydown', handlePaste);
    return () => window.removeEventListener('keydown', handlePaste);
  }, [selectedPeerId, localPeerInfo.peerId, setClipboardText]);

  // QR scan handler
  const handleQrScan = useCallback((code: string) => {
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode.length >= 6 && signalingClientRef.current) {
      signalingClientRef.current.send({
        type: 'JOIN_ROOM',
        roomId: cleanCode,
        peerInfo: localPeerInfo,
      });
    }
    closeQrModal();
  }, [localPeerInfo, closeQrModal]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono">
      <header className="border-b border-zinc-800 px-4 py-3">
        <h1 className="text-lg font-medium">Regex</h1>
        <p className="text-xs text-zinc-500">P2P File Transfer</p>
      </header>

      <main className="p-4 space-y-4 max-w-3xl mx-auto pb-32">
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

        {/* Radar View - replaces Peer List */}
        <section className="rounded-lg border border-zinc-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">Peers</h2>
            <button
              type="button"
              onClick={() => openQrModal('host')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-600 hover:border-zinc-500 text-zinc-300 hover:text-zinc-100 transition-colors"
            >
              <QrCode size={14} />
              <span>Pair</span>
            </button>
          </div>
          <RadarView />
        </section>

        {/* File Input & Send Controls */}
        <section className="rounded-lg border border-zinc-800 p-4">
          <h2 className="text-sm font-medium mb-3">File Transfer</h2>

          <input
            id="file-input"
            type="file"
            className="mb-3 block w-full text-sm text-zinc-400 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700"
            disabled={!selectedPeerId || transferState?.direction !== null}
          />

          <div className="flex gap-2">
            <button
              onClick={handleSendFile}
              disabled={!selectedPeerId || transferState?.direction !== null}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded border border-zinc-600 hover:border-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload size={14} />
              <span>Send File</span>
            </button>
            <button
              onClick={handleResetTransferState}
              disabled={transferState?.direction === null}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded border border-red-500/50 text-red-400 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X size={14} />
              <span>Cancel</span>
            </button>
            <button
              onClick={cleanupWebRTC}
              disabled={selectedPeerId === null}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded border border-zinc-600 hover:border-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
            >
              <FileText size={14} />
              <span>Disconnect</span>
            </button>
          </div>
        </section>

        {/* Transfer Progress (legacy inline - TransferSheet handles modal now) */}
        {transferState && transferState.direction !== null && (
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

        {/* Instant Text Box at bottom */}
        <InstantTextBox onSend={handleSendText} />

        {/* QR Pairing Modal */}
        <QrPairingModal roomId={roomId} onScan={handleQrScan} />

        {/* Transfer Sheet Modal */}
        <TransferSheet
          onAccept={handleTransferSheetAccept}
          onDecline={handleTransferSheetDecline}
          onCancel={handleTransferSheetCancel}
        />

        {/* Drag Drop Overlay */}
        <DragDropOverlay onDrop={handleDrop} />
      </main>
    </div>
  );
}

export default App;