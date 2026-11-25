import { useEffect, useRef, useState } from 'react';
import { Download, File, CheckCircle, AlertCircle, X } from 'lucide-react';
import { useSessionStore } from '../store/useSessionStore';
import JSZip from 'jszip';

interface TransferSheetProps {
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
}

const noop = (): void => {};

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatSpeed(mbps: number): string {
  return `${mbps.toFixed(1)} MB/s`;
}

function formatEta(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return `${mins}m ${secs}s`;
}

function formatPercentage(percentage: number): string {
  return `${percentage.toFixed(1)}%`;
}

export function TransferSheet({
  onAccept = noop,
  onDecline = noop,
  onCancel = noop,
}: TransferSheetProps) {
  const transferState = useSessionStore((state) => state.transferState);
  const resetTransferState = useSessionStore((state) => state.resetTransferState);
  const [autoAccept, setAutoAccept] = useState(false);
  const downloadUrlsRef = useRef<string[]>([]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      downloadUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      downloadUrlsRef.current = [];
    };
  }, []);

  if (!transferState) {
    return null;
  }

  const { direction, fileName, fileSize, progress } = transferState;
  const isReceiving = direction === 'receiving';
  const isCompleted = progress !== null && progress.percentage >= 100;
  const isActive = progress !== null && !isCompleted;
  const isIncomingOffer = isReceiving && progress === null;

  const handleClose = () => {
    downloadUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    downloadUrlsRef.current = [];
    resetTransferState();
  };

  const handleDownload = async () => {
    // In a real implementation, this would download the actual file(s)
    // For now, we create a placeholder blob and trigger download
    const blob = new Blob([`Placeholder content for ${fileName}`], {
      type: 'application/octet-stream',
    });
    const url = URL.createObjectURL(blob);
    downloadUrlsRef.current.push(url);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName ?? 'download';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Revoke after a short delay to allow download to start
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadAll = async () => {
    // Create a ZIP with all transferred files
    const zip = new JSZip();
    // In real implementation, we'd have access to actual file blobs
    zip.file(fileName ?? 'transfer.txt', `Content of ${fileName}`);
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    downloadUrlsRef.current.push(url);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'transfer.zip';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Modal/Sheet container styles
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const containerClass = isMobile
    ? 'fixed bottom-0 left-0 right-0 z-50 animate-slide-up'
    : 'fixed inset-0 z-50 flex items-center justify-center p-4';

  const sheetClass = isMobile
    ? 'w-full bg-zinc-950 border-t border-zinc-800 rounded-t-2xl'
    : 'w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl';

  if (isIncomingOffer) {
    return (
      <div className={containerClass} role="dialog" aria-modal="true" aria-label="Incoming transfer">
        {!isMobile && (
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
            aria-hidden="true"
          />
        )}
        <div className={`${sheetClass} ${isMobile ? '' : 'shadow-2xl'}`}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <h2 className="text-lg font-medium text-zinc-100">
              {isReceiving ? 'Incoming Transfer' : 'Outgoing Transfer'}
            </h2>
            {!isMobile && (
              <button
                type="button"
                onClick={handleClose}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            )}
          </div>

          {/* Content */}
          <div className="p-5 space-y-4">
            {/* File info */}
            <div className="flex items-center gap-4 p-4 bg-zinc-900 rounded-xl border border-zinc-800">
              <File size={32} className="text-green-400 flex-shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-100 truncate">{fileName ?? 'Unknown file'}</p>
                <p className="text-xs text-zinc-500 font-mono tabular-nums">{formatBytes(fileSize)}</p>
              </div>
              {isReceiving && (
                <AlertCircle size={20} className="text-amber-400 flex-shrink-0" aria-hidden="true" />
              )}
            </div>

            {/* Sender info for incoming */}
            {isReceiving && (
              <p className="text-xs text-zinc-500 text-center">
                Awaiting your response
              </p>
            )}

            {/* Auto-accept checkbox */}
            {isReceiving && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoAccept}
                  onChange={(e) => setAutoAccept(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-green-500 focus:ring-green-500 focus:ring-1"
                  aria-label="Auto-accept future transfers from this sender"
                />
                <span className="text-sm text-zinc-300">Auto-accept future transfers</span>
              </label>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onDecline}
                className="flex-1 px-4 py-3 bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-xl font-medium hover:bg-zinc-700 transition-colors"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={onAccept}
                className="flex-1 px-4 py-3 bg-green-500 text-zinc-950 font-medium rounded-xl hover:bg-green-400 transition-colors"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isActive) {
    return (
      <div className={containerClass} role="dialog" aria-modal="true" aria-label="Transfer in progress">
        {!isMobile && (
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />
        )}
        <div className={`${sheetClass} ${isMobile ? '' : 'shadow-2xl'}`}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <h2 className="text-lg font-medium text-zinc-100">
              {isReceiving ? 'Receiving' : 'Sending'}
            </h2>
            {!isMobile && (
              <button
                type="button"
                onClick={onCancel}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
                aria-label="Cancel transfer"
              >
                <X size={20} />
              </button>
            )}
          </div>

          {/* Content */}
          <div className="p-5 space-y-4">
            {/* File info */}
            <div className="flex items-center gap-4 p-4 bg-zinc-900 rounded-xl border border-zinc-800">
              <File size={32} className="text-green-400 flex-shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-100 truncate">{fileName ?? 'Unknown file'}</p>
                <p className="text-xs text-zinc-500 font-mono tabular-nums">{formatBytes(fileSize)}</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Progress</span>
                <span className="font-mono tabular-nums text-green-400">
                  {progress ? formatPercentage(progress.percentage) : '0.0%'}
                </span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-300 ease-out"
                  style={{ width: progress ? `${Math.min(progress.percentage, 100)}%` : '0%' }}
                  role="progressbar"
                  aria-valuenow={progress?.percentage ?? 0}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Transfer progress"
                />
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-zinc-900 rounded-xl border border-zinc-800">
              <div className="text-center">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Speed</p>
                <p className="font-mono tabular-nums text-green-400 text-lg">
                  {progress ? formatSpeed(progress.speedMBps) : '0.0 MB/s'}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Transferred</p>
                <p className="font-mono tabular-nums text-zinc-300 text-lg">
                  {progress ? formatBytes(progress.bytesTransferred) : '0 B'}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">ETA</p>
                <p className="font-mono tabular-nums text-zinc-300 text-lg">
                  {progress ? formatEta(progress.etaSeconds) : '—'}
                </p>
              </div>
            </div>

            {/* Cancel button on mobile */}
            {isMobile && (
              <button
                type="button"
                onClick={onCancel}
                className="w-full px-4 py-3 bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-xl font-medium hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className={containerClass} role="dialog" aria-modal="true" aria-label="Transfer complete">
        {!isMobile && (
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />
        )}
        <div className={`${sheetClass} ${isMobile ? '' : 'shadow-2xl'}`}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <h2 className="text-lg font-medium text-zinc-100">Transfer Complete</h2>
          </div>

          {/* Content */}
          <div className="p-5 space-y-4 text-center">
            {/* Success icon */}
            <div className="flex justify-center">
              <CheckCircle size={48} className="text-green-500" aria-hidden="true" />
            </div>

            {/* File info */}
            <div className="flex items-center justify-center gap-4 p-4 bg-zinc-900 rounded-xl border border-zinc-800">
              <File size={32} className="text-green-400 flex-shrink-0" aria-hidden="true" />
              <div className="text-left">
                <p className="text-sm font-medium text-zinc-100 truncate max-w-[200px]">
                  {fileName ?? 'Unknown file'}
                </p>
                <p className="text-xs text-zinc-500 font-mono tabular-nums">{formatBytes(fileSize)}</p>
              </div>
            </div>

            <p className="text-sm text-zinc-400">File ready to download</p>

            {/* Download buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleDownload}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-500/20 text-green-400 border border-green-500/50 rounded-xl font-medium hover:bg-green-500/30 transition-colors"
              >
                <Download size={18} />
                <span>Download</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadAll}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-xl font-medium hover:bg-zinc-700 transition-colors"
              >
                <File size={18} />
                <span>Download All (.ZIP)</span>
              </button>
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={handleClose}
              className="w-full px-4 py-3 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-xl font-medium hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback for unexpected states
  return null;
}