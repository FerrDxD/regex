/**
 * Shared component types for Regex UI
 * Single source of truth for component props and data shapes
 */

import type { PeerMetadata } from '../core/types';
import type { ProgressInfo } from '../core/fileTransfer';
import type { TransferDirection } from '../store/useSessionStore';

// ============================================
// RadarView Types
// ============================================

export interface RadarViewProps {
  className?: string;
}

export interface PeerNodeProps {
  peer: PeerMetadata;
  isSelected: boolean;
  connectionStatus: 'searching' | 'handshaking' | 'connected' | 'error';
  onSelect: (peerId: string) => void;
}

// ============================================
// TransferSheet Types
// ============================================

export type TransferSheetState = 'incoming' | 'active' | 'completed' | null;

export interface TransferSheetProps {
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
  onDownload?: () => void;
  onDownloadAll?: () => void;
}

export interface TransferFileMeta {
  fileId: string;
  name: string;
  size: number;
  type: string;
}

export interface IncomingTransferData {
  senderName: string;
  files: TransferFileMeta[];
  totalSize: number;
  autoAccept?: boolean;
}

export interface ActiveTransferData {
  direction: 'sending' | 'receiving';
  fileName: string;
  fileSize: number;
  progress: ProgressInfo | null;
}

export interface CompletedTransferData {
  fileName: string;
  fileSize: number;
  fileCount: number;
}

// ============================================
// QrPairingModal Types
// ============================================

export interface QrPairingModalProps {
  roomId: string;
  onScan?: (code: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export type QrTab = 'host' | 'guest';

// ============================================
// InstantTextBox Types
// ============================================

export interface InstantTextBoxProps {
  onSend?: (text: string) => void;
  receivedText?: string;
  isConnected?: boolean;
  selectedPeerName?: string;
  placeholder?: string;
}

export interface TextSegment {
  type: 'text' | 'url';
  content: string;
  href?: string;
}

// ============================================
// DragDropOverlay Types
// ============================================

export interface DragDropOverlayProps {
  onDrop?: (files: File[]) => void;
  isActive: boolean;
  onClose: () => void;
  targetDeviceName: string;
}

// ============================================
// OfflineIndicator Types
// ============================================

export interface OfflineIndicatorProps {
  className?: string;
}

// ============================================
// PwaInstallPrompt Types
// ============================================

export interface PwaInstallPromptProps {
  className?: string;
}

// ============================================
// ConnectionStatus Types
// ============================================

export interface ConnectionStatusProps {
  isConnected: boolean;
  localPeerId: string;
  connectionStatus: 'searching' | 'handshaking' | 'connected' | 'error';
  className?: string;
}

// ============================================
// FileTransferSection Types
// ============================================

export interface FileTransferSectionProps {
  selectedPeerId: string | null;
  isConnected: boolean;
  transferDirection: TransferDirection;
  onSendFile: () => void;
  onCancel: () => void;
  onDisconnect: () => void;
  disabled?: boolean;
  className?: string;
}

// ============================================
// WebRTCStatus Types
// ============================================

export interface WebRTCStatusProps {
  peerConnectionState: string;
  dataChannelState: string;
  selectedPeerId: string | null;
  className?: string;
}

// ============================================
// Common UI Types
// ============================================

export type Size = 'sm' | 'md' | 'lg';

export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface BaseComponentProps {
  className?: string;
  'data-testid'?: string;
}

// Animation variants
export type AnimationVariant = 'fade' | 'slide-up' | 'slide-down' | 'scale' | 'none';

export interface TransitionProps {
  enter?: AnimationVariant;
  exit?: AnimationVariant;
  delay?: number;
  duration?: number;
}