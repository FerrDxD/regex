import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useSessionStore } from '../store/useSessionStore';
import type { PeerMetadata } from '../core/types';

interface DragDropOverlayProps {
  onDrop?: (files: File[]) => void;
}

const noop = (): void => {};

function getSelectedPeerAlias(peers: PeerMetadata[], selectedPeerId: string | null): string {
  if (!selectedPeerId) return 'perangkat';
  const peer = peers.find((p) => p.peerId === selectedPeerId);
  return peer?.alias ?? 'perangkat';
}

export function DragDropOverlay({ onDrop = noop }: DragDropOverlayProps) {
  const dragDropActive = useSessionStore((state) => state.dragDropActive);
  const setDragDropActive = useSessionStore((state) => state.setDragDropActive);
  const selectedPeerId = useSessionStore((state) => state.selectedPeerId);
  const peers = useSessionStore((state) => state.peers);

  const deviceName = getSelectedPeerAlias(peers, selectedPeerId);

  useEffect(() => {
    if (!dragDropActive) return;

    const handler = (event: DragEvent): void => {
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('dragover', handler);
    return () => window.removeEventListener('dragover', handler);
  }, [dragDropActive]);

  useEffect(() => {
    if (!dragDropActive) return;

    const handler = (event: DragEvent): void => {
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('dragleave', handler);
    return () => window.removeEventListener('dragleave', handler);
  }, [dragDropActive]);

  useEffect(() => {
    if (!dragDropActive) return;

    const handler = (event: DragEvent): void => {
      event.preventDefault();
      event.stopPropagation();

      const dataTransfer = event.dataTransfer;
      if (!dataTransfer) return;

      const files = Array.from(dataTransfer.files);
      if (files.length > 0) {
        onDrop(files);
      }
      setDragDropActive(false);
    };

    window.addEventListener('drop', handler);
    return () => window.removeEventListener('drop', handler);
  }, [dragDropActive, onDrop, setDragDropActive]);

  if (!dragDropActive) {
    return null;
  }

  const handleClose = (): void => {
    setDragDropActive(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Drag and drop files"
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      <div className="absolute top-4 right-4 z-10">
        <button
          type="button"
          onClick={handleClose}
          className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
          aria-label="Tutup"
        >
          <X size={24} />
        </button>
      </div>

      <div className="text-center px-6">
        <div className="w-24 h-24 mx-auto mb-6 rounded-2xl border-2 border-dashed border-green-500/50 bg-green-500/10 flex items-center justify-center">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-green-500"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>

        <p className="text-lg font-medium text-zinc-100 mb-2">
          Lepaskan file untuk mengirim ke
        </p>
        <p className="text-xl font-mono tabular-nums text-green-400 font-medium">
          {deviceName}
        </p>
      </div>
    </div>
  );
}