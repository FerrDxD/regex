import { Monitor, Smartphone, Tablet, Wifi, WifiOff } from 'lucide-react';
import { useSessionStore } from '../store/useSessionStore';
import type { PeerNodeProps } from './types';

/**
 * Device Icon Component
 * Renders the appropriate device icon based on device type
 */
function DeviceIcon({ deviceType, className = '' }: { deviceType: 'desktop' | 'mobile' | 'tablet'; className?: string }) {
  const icons = {
    desktop: Monitor,
    mobile: Smartphone,
    tablet: Tablet,
  };
  const Icon = icons[deviceType] || Monitor;
  return <Icon size={18} className={className} aria-hidden="true" />;
}

/**
 * Connection Status Indicator
 * Shows the current connection state with appropriate visual feedback
 */
function ConnectionStatusIndicator({
  status
}: {
  status: 'searching' | 'handshaking' | 'connected' | 'error';
}) {
  const statusConfig = {
    searching: {
      label: 'Mencari',
      dotClass: 'status-dot status-dot-disconnected',
      icon: WifiOff,
      pulse: false
    },
    handshaking: {
      label: 'Menghubungkan',
      dotClass: 'status-dot status-dot-connecting',
      icon: Wifi,
      pulse: true
    },
    connected: {
      label: 'Terhubung',
      dotClass: 'status-dot status-dot-connected',
      icon: Wifi,
      pulse: true
    },
    error: {
      label: 'Error',
      dotClass: 'status-dot status-dot-disconnected',
      icon: WifiOff,
      pulse: false
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2 text-xs font-mono text-text-secondary">
      <span className={config.dotClass} aria-hidden="true" />
      <Icon size={12} className="text-text-secondary" aria-hidden="true" />
      <span className="tabular-nums">{config.label}</span>
    </div>
  );
}

/**
 * Individual Peer Node on Radar
 * Interactive device representation with selection and connection states
 */
function PeerNode({
  peer,
  isSelected,
  connectionStatus,
  onSelect
}: PeerNodeProps) {
  // Calculate position based on peerId for consistent placement
  const angle = ((peer.peerId.charCodeAt(0) % 360) * Math.PI) / 180;
  const radius = 70;
  const x = 128 + radius * Math.cos(angle);
  const y = 128 + radius * Math.sin(angle);

  const nodeClasses = [
    'peer-node',
    'absolute flex flex-col items-center justify-center p-1',
    isSelected ? 'peer-node-selected' : '',
    connectionStatus === 'connected' ? 'peer-node-connected' : '',
    connectionStatus === 'handshaking' ? 'border-zinc-600 bg-zinc-800/30' : '',
    connectionStatus === 'searching' ? 'border-zinc-700 bg-zinc-900' : '',
  ].filter(Boolean).join(' ');

  const handleClick = () => onSelect(peer.peerId);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(peer.peerId);
    }
  };

  return (
    <button
      key={peer.peerId}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={nodeClasses}
      style={{ left: `${x - 24}px`, top: `${y - 24}px` }}
      aria-label={`${peer.alias} (${peer.deviceType})`}
      aria-pressed={isSelected}
      role="button"
      tabIndex={0}
    >
      <div
        className={`
          w-12 h-12 rounded-full flex items-center justify-center border transition-all duration-200
          ${isSelected
            ? 'border-accent-primary bg-accent-primary/20 shadow-glow-sm'
            : connectionStatus === 'connected'
              ? 'border-accent-primary/50 bg-zinc-800/50'
              : connectionStatus === 'handshaking'
                ? 'border-zinc-600 bg-zinc-800/30'
                : 'border-zinc-700 bg-zinc-900'
          }
        `}
      >
        <DeviceIcon deviceType={peer.deviceType} className={isSelected ? 'text-accent-primary' : 'text-text-secondary'} />
      </div>
      <span className="mt-1.5 text-xs font-mono tabular-nums text-text-primary truncate w-20 text-center font-medium">
        {peer.alias}
      </span>
      <span className="mt-1 text-[10px] text-text-muted font-mono tabular-nums truncate w-20 text-center">
        {peer.os}
      </span>
    </button>
  );
}

/**
 * Radar Background SVG
 * Concentric circles with optional pulse animation
 */
function RadarBackground({
  connectionStatus,
  prefersReducedMotion
}: {
  connectionStatus: 'searching' | 'handshaking' | 'connected' | 'error';
  prefersReducedMotion: boolean;
}) {
  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 256 256" aria-hidden="true">
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      {/* Concentric rings */}
      <circle cx="128" cy="128" r="100" className="radar-ring" strokeWidth="1" fill="none" />
      <circle cx="128" cy="128" r="65" className="radar-ring" strokeWidth="1" fill="none" />
      <circle cx="128" cy="128" r="30" className="radar-ring" strokeWidth="1" fill="none" />

      {/* Center dot */}
      <circle
        cx="128"
        cy="128"
        r="4"
        fill={connectionStatus === 'connected' ? '#10B981' : '#3F3F46'}
        className="transition-colors duration-300"
      />

      {/* Pulse animation when searching */}
      {!prefersReducedMotion && connectionStatus === 'searching' && (
        <>
          <circle
            cx="128"
            cy="128"
            r="100"
            className="radar-pulse"
            strokeWidth="2"
            fill="none"
            style={{ animationDelay: '0ms' }}
          />
          <circle
            cx="128"
            cy="128"
            r="100"
            className="radar-pulse"
            strokeWidth="2"
            fill="none"
            style={{ animationDelay: '1000ms' }}
          />
          <circle
            cx="128"
            cy="128"
            r="100"
            className="radar-pulse"
            strokeWidth="2"
            fill="none"
            style={{ animationDelay: '2000ms' }}
          />
        </>
      )}

      {/* Connecting animation - rotating line */}
      {!prefersReducedMotion && connectionStatus === 'handshaking' && (
        <g className="gpu-accelerated">
          <line
            x1="128"
            y1="128"
            x2="128"
            y2="28"
            stroke="#10B981"
            strokeWidth="2"
            strokeDasharray="8,8"
            className="animate-spin-slow"
            style={{ transformOrigin: '128px 128px' }}
          />
        </g>
      )}
    </svg>
  );
}

/**
 * Empty State for Radar
 * Shows when no peers are discovered
 */
function RadarEmptyState({ connectionStatus }: { connectionStatus: 'searching' | 'handshaking' | 'connected' | 'error' }) {
  const messages = {
    searching: 'Menunggu perangkat lain bergabung...',
    handshaking: 'Menghubungkan ke perangkat...',
    connected: 'Perangkat terhubung. Siap mentransfer.',
    error: 'Koneksi bermasalah. Coba mode QR Pairing.',
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-8 text-center">
      <div className="w-16 h-16 rounded-full bg-zinc-900/50 border border-border-subtle flex items-center justify-center mb-4">
        <WifiOff size={24} className="text-text-muted" aria-hidden="true" />
      </div>
      <p className="text-sm text-text-secondary font-mono">{messages[connectionStatus]}</p>
      {connectionStatus === 'searching' && (
        <p className="mt-1 text-xs text-text-muted max-w-xs">
          Buka Regex di perangkat lain di jaringan Wi-Fi yang sama, atau gunakan QR Pairing.
        </p>
      )}
    </div>
  );
}

/**
 * RadarView - Main Radar Component
 * Visual device discovery canvas with animated radar rings and peer nodes
 */
export function RadarView({ className = '' }: { className?: string }) {
  const peers = useSessionStore((state) => state.peers);
  const selectedPeerId = useSessionStore((state) => state.selectedPeerId);
  const connectionStatus = useSessionStore((state) => state.connectionStatus);
  const setSelectedPeer = useSessionStore((state) => state.setSelectedPeer);

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <section className={`relative flex flex-col items-center gap-4 pt-6 pb-10 ${className}`} aria-label="Device Discovery Radar">
      {/* Header with Connection Status */}
      <div className="flex items-center justify-between w-full max-w-xs px-4">
        <div className="flex items-center gap-2 text-xs font-mono text-text-secondary">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" aria-hidden="true" />
          <span>Radar</span>
          <span className="mx-1" aria-hidden="true">|</span>
          <ConnectionStatusIndicator status={connectionStatus} />
        </div>

        {/* Peer Count Badge */}
        <span className="px-2 py-0.5 text-[10px] font-mono tabular-nums text-text-muted bg-zinc-900/50 rounded-full border border-border-subtle">
          {peers.length} perangkat
        </span>
      </div>

      {/* Radar Canvas */}
      <div className="relative w-64 h-64 flex-shrink-0">
        <RadarBackground
          connectionStatus={connectionStatus}
          prefersReducedMotion={prefersReducedMotion}
        />

        {/* Center Node (Current Device) */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={`
              w-10 h-10 rounded-full transition-all duration-300
              ${connectionStatus === 'connected'
                ? 'bg-accent-primary shadow-glow-md'
                : 'bg-zinc-700'
              }
            `}
            aria-hidden="true"
          />
        </div>

        {/* Peer Nodes */}
        <div className="absolute inset-0 w-full h-full pointer-events-none">
          {peers.map((peer) => (
            <div key={peer.peerId} className="absolute pointer-events-auto">
              <PeerNode
                peer={peer}
                isSelected={selectedPeerId === peer.peerId}
                connectionStatus={connectionStatus}
                onSelect={setSelectedPeer}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Empty State Overlay */}
      {peers.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <RadarEmptyState connectionStatus={connectionStatus} />
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-text-muted font-mono pt-2">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-accent-primary" aria-hidden="true" />
          <span>Terhubung</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-status-warning animate-pulse" aria-hidden="true" />
          <span>Menghubungkan</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-zinc-600" aria-hidden="true" />
          <span>Tersedia</span>
        </div>
      </div>
    </section>
  );
}