import { useSessionStore } from '../store/useSessionStore';

export function OfflineIndicator() {
  const isOnline = useSessionStore((state) => state.isOnline);

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800 border border-zinc-600 text-xs">
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: isOnline ? '#10B981' : '#EF4444' }}
      />
      <span className={isOnline ? 'text-green-400' : 'text-red-400'}>
        {isOnline ? 'Online' : 'Offline'}
      </span>
    </div>
  );
}
