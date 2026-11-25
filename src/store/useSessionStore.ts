import { create } from 'zustand';
import type { PeerMetadata } from '../core/types';
import type { ProgressInfo } from '../core/fileTransfer';

export type TransferDirection = 'sending' | 'receiving' | null;

export type TransferState = {
  direction: TransferDirection;
  fileId: string | null;
  fileName: string | null;
  fileSize: number | null;
  progress: ProgressInfo | null;
  abortController: AbortController | null;
};

export type ConnectionStatus = 'searching' | 'handshaking' | 'connected' | 'error';

type SessionState = {
  peers: PeerMetadata[];
  selectedPeerId: string | null;
  connectionStatus: ConnectionStatus;
  transferState: TransferState | null;
  qrModalOpen: boolean;
  qrTab: 'host' | 'guest';
  dragDropActive: boolean;
  clipboardText: string;
};

type SessionActions = {
  setPeers: (peers: PeerMetadata[]) => void;
  addPeer: (peer: PeerMetadata) => void;
  removePeer: (peerId: string) => void;
  setSelectedPeer: (peerId: string | null) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setTransferState: (state: TransferState | null) => void;
  resetTransferState: () => void;
  openQrModal: (tab?: 'host' | 'guest') => void;
  closeQrModal: () => void;
  setQrTab: (tab: 'host' | 'guest') => void;
  setDragDropActive: (active: boolean) => void;
  setClipboardText: (text: string) => void;
};

type SessionStore = SessionState & SessionActions;

export const useSessionStore = create<SessionStore>((set) => ({
  // State
  peers: [],
  selectedPeerId: null,
  connectionStatus: 'searching',
  transferState: null,
  qrModalOpen: false,
  qrTab: 'host',
  dragDropActive: false,
  clipboardText: '',

  // Actions
  setPeers: (peers) => set({ peers }),
  addPeer: (peer) => set((state) => ({ peers: [...state.peers.filter((p) => p.peerId !== peer.peerId), peer] })),
  removePeer: (peerId) => set((state) => ({ peers: state.peers.filter((p) => p.peerId !== peerId) })),
  setSelectedPeer: (peerId) => set({ selectedPeerId: peerId }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setTransferState: (state) => set({ transferState: state }),
  resetTransferState: () => set({ transferState: null }),
  openQrModal: (tab = 'host') => set({ qrModalOpen: true, qrTab: tab }),
  closeQrModal: () => set({ qrModalOpen: false }),
  setQrTab: (tab) => set({ qrTab: tab }),
  setDragDropActive: (active) => set({ dragDropActive: active }),
  setClipboardText: (text) => set({ clipboardText: text }),
}));