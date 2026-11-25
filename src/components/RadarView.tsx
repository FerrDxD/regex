import { Monitor, Smartphone } from 'lucide-react';
import { useSessionStore } from '../store/useSessionStore';

type DeviceIconProps = { deviceType: 'desktop' | 'mobile' };

function DeviceIcon({ deviceType }: DeviceIconProps) {
  return deviceType === 'mobile' ? <Smartphone size={16} /> : <Monitor size={16} />;
}

function capitalizeStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function RadarView() {
  const peers = useSessionStore((state) => state.peers);
  const selectedPeerId = useSessionStore((state) => state.selectedPeerId);
  const connectionStatus = useSessionStore((state) => state.connectionStatus);
  const setSelectedPeer = useSessionStore((state) => state.setSelectedPeer);

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <section className="relative flex flex-col items-center gap-4 pt-6 pb-10">
      <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 mb-2">
        <span className={`w-1.5 h-1.5 rounded-full ${
          connectionStatus === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'
        }`} />
        <span>Radar</span>
        <span className="mx-0.5">|</span>
        <span className="tabular-nums">{capitalizeStatus(connectionStatus)}</span>
      </div>

      {/* Radar SVG */}
      <div className="relative w-64 h-64">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 256 256">
          <circle cx="128" cy="128" r="100" stroke="zinc-800" strokeWidth="1" fill="none" />
          <circle cx="128" cy="128" r="65" stroke="zinc-800" strokeWidth="1" fill="none" />
          <circle cx="128" cy="128" r="30" stroke="zinc-800" strokeWidth="1" fill="none" />

          {!prefersReducedMotion && connectionStatus === 'searching' && (
            <circle
              cx="128"
              cy="128"
              r="100"
              stroke="emerald-500"
              strokeWidth="2"
              fill="none"
              className="animate-pulse"
              opacity={0.6}
            />
          )}
        </svg>

        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={`w-8 h-8 rounded-full ${
              connectionStatus === 'connected'
                ? 'bg-green-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]'
                : 'bg-zinc-700'
            }`}
          />
        </div>

        {peers.map((peer) => {
          const angle = ((peer.peerId.charCodeAt(0) % 360) * Math.PI) / 180;
          const radius = 70;
          const x = 128 + radius * Math.cos(angle);
          const y = 128 + radius * Math.sin(angle);
          const isSelected = selectedPeerId === peer.peerId;

          return (
            <button
              key={peer.peerId}
              onClick={() => setSelectedPeer(peer.peerId)}
              className="absolute flex flex-col items-center justify-center p-1 transition-all duration-200"
              style={{ left: `${x - 20}px`, top: `${y - 20}px` }}
              aria-label={peer.alias}
              role="button"
            >
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center border ${
                  isSelected
                    ? 'border-green-500 bg-green-500/20 shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                    : connectionStatus === 'connected'
                    ? 'border-green-500/50 bg-zinc-800/50'
                    : connectionStatus === 'handshaking'
                    ? 'border-zinc-600 bg-zinc-800/30'
                    : 'border-zinc-700 bg-zinc-900'
                }`}
              >
                <DeviceIcon deviceType={peer.deviceType} />
              </div>
              <span className="mt-1 text-xs font-mono tabular-nums text-zinc-300 truncate w-16 text-center">
                {peer.alias}
              </span>
              <span className="mt-0.5 text-[10px] text-zinc-500 font-mono tabular-nums">
                {peer.os}
              </span>
            </button>
          );
        })}
      </div>

      {peers.length === 0 && (
        <p className="text-xs text-zinc-500 font-mono">No peers found. Waiting for others to join...</p>
      )}
    </section>
  );
}
