import { useEffect, useRef, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Copy,
  Camera,
  QrCode,
  X,
  Check,
} from 'lucide-react';
import { useSessionStore } from '../store/useSessionStore';

interface QrPairingModalProps {
  roomId: string;
  onScan?: (scannedCode: string) => void;
}

const ROOM_URL_BASE = typeof window !== 'undefined' ? window.location.origin : '';

function getRoomUrl(roomId: string): string {
  return `${ROOM_URL_BASE}?room=${roomId}`;
}

function TabButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active
          ? 'bg-green-500/20 text-green-400 border border-green-500/50'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
      }`}
    >
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );
}

function CopyButton({
  text,
  label = 'Copy',
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
        copied
          ? 'bg-green-500/20 text-green-400 border border-green-500/50'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700'
      }`}
      aria-label={copied ? 'Copied' : label}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      <span>{copied ? 'Copied' : label}</span>
    </button>
  );
}

export function QrPairingModal({ roomId, onScan = () => {} }: QrPairingModalProps) {
  const qrModalOpen = useSessionStore((state) => state.qrModalOpen);
  const qrTab = useSessionStore((state) => state.qrTab);
  const closeQrModal = useSessionStore((state) => state.closeQrModal);
  const setQrTab = useSessionStore((state) => state.setQrTab);

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const scannerStartedRef = useRef(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  const roomUrl = getRoomUrl(roomId);

  // Cleanup scanner on unmount or modal close
  const cleanupScanner = useCallback(async () => {
    if (html5QrcodeRef.current && isScanning) {
      try {
        await html5QrcodeRef.current.stop();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
      try {
        await html5QrcodeRef.current.clear();
      } catch (err) {
        console.warn('Error clearing scanner:', err);
      }
      setIsScanning(false);
      scannerStartedRef.current = false;
    }
    html5QrcodeRef.current = null;
  }, [isScanning]);

  useEffect(() => {
    if (!qrModalOpen) {
      cleanupScanner();
    }
    return () => {
      cleanupScanner();
    };
  }, [qrModalOpen, cleanupScanner]);

  // Start scanner lazily when Guest tab becomes active
  useEffect(() => {
    if (qrTab === 'guest' && qrModalOpen && !scannerStartedRef.current) {
      scannerStartedRef.current = true;
      const scanner = new Html5Qrcode('qr-reader');
      html5QrcodeRef.current = scanner;

      scanner
        .start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            // Extract room code from URL or use as-is
            const match = decodedText.match(/room=([^&]+)/);
            const code = match ? match[1] : decodedText;
            onScan(code);
          },
          (error: string) => {
            // Ignore scan errors (no QR code found)
            if (!error.includes('No QR code')) {
              console.debug('QR scan error:', error);
            }
          }
        )
        .then(() => {
          setIsScanning(true);
          setCameraError(null);
        })
        .catch((err) => {
          setCameraError('Kamera tidak dapat diakses');
          setIsScanning(false);
          console.error('Camera access denied:', err);
        });
    } else if (qrTab === 'host' && scannerStartedRef.current) {
      cleanupScanner();
    }
  }, [qrTab, qrModalOpen, cleanupScanner, onScan]);

  if (!qrModalOpen) {
    return null;
  }

  const handleManualJoin = () => {
    const code = manualCode.trim().toUpperCase();
    if (code.length >= 6) {
      onScan(code);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleManualJoin();
    }
  };

  const closeModal = () => {
    cleanupScanner();
    closeQrModal();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="QR Pairing"
    >
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-medium text-zinc-100">Pair Devices</h2>
          <button
            type="button"
            onClick={closeModal}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-4 py-2 border-b border-zinc-800 bg-zinc-900/50 gap-2 overflow-x-auto">
          <TabButton
            label="Host"
            icon={QrCode}
            active={qrTab === 'host'}
            onClick={() => setQrTab('host')}
          />
          <TabButton
            label="Guest"
            icon={Camera}
            active={qrTab === 'guest'}
            onClick={() => setQrTab('guest')}
          />
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {qrTab === 'host' && (
            <div className="space-y-4">
              {/* QR Code */}
              <div className="flex flex-col items-center gap-3">
                <div className="bg-white p-4 rounded-lg">
                  <QRCodeSVG
                    value={roomUrl}
                    size={200}
                    level="M"
                    includeMargin={true}
                  />
                </div>
                <p className="text-xs text-zinc-500 text-center">Scan with Guest device</p>
              </div>

              {/* Room Code */}
              <div className="flex flex-col items-center gap-2 p-4 bg-zinc-900 rounded-xl border border-zinc-800">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Room Code</span>
                <code className="text-3xl font-mono tabular-nums text-green-400 letter-spacing-wide">
                  {roomId}
                </code>
                <CopyButton text={roomUrl} label="Copy Link" />
              </div>

              <p className="text-xs text-zinc-500 text-center">
                Share the code or link above with the receiving device.
              </p>
            </div>
          )}

          {qrTab === 'guest' && (
            <div className="space-y-4">
              {/* Camera Scanner */}
              <div className="relative">
                <div id="qr-reader" className="w-full aspect-square bg-zinc-900 rounded-xl overflow-hidden" />
                {cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center p-4 bg-zinc-900/90 rounded-xl">
                    <div className="text-center">
                      <Camera size={32} className="mx-auto mb-2 text-zinc-500" />
                      <p className="text-sm text-zinc-400">{cameraError}</p>
                      <p className="text-xs text-zinc-600 mt-1">Manual input below still works</p>
                    </div>
                  </div>
                )}
                {!isScanning && !cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center p-4 bg-zinc-900/90 rounded-xl">
                    <div className="text-center">
                      <Camera size={32} className="mx-auto mb-2 text-zinc-500" />
                      <p className="text-sm text-zinc-400">Starting camera...</p>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-xs text-zinc-500 text-center">
                Point camera at Host QR code
              </p>

              {/* Manual Input Fallback */}
              <div className="border-t border-zinc-800 pt-4 space-y-3">
                <p className="text-xs text-zinc-500 text-center">Or enter code manually</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter 6-digit code"
                    className="flex-1 px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-500 font-mono tabular-nums text-lg text-center focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                    aria-label="Room code"
                    autoComplete="off"
                    inputMode="text"
                  />
                  <button
                    type="button"
                    onClick={handleManualJoin}
                    disabled={manualCode.trim().length < 6}
                    className="px-5 py-3 bg-green-500/20 text-green-400 border border-green-500/50 rounded-xl font-medium hover:bg-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    Join
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}