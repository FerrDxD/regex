import { useCallback, useEffect } from 'react';
import { useSessionStore } from '../store/useSessionStore';
import { getDeferredPrompt, setDeferredPrompt } from '../lib/pwaBridge';
import { Upload, X } from 'lucide-react';
export function PwaInstallPrompt() {
  const showInstallPrompt = useSessionStore((state) => state.showInstallPrompt);
  const pwaInstalled = useSessionStore((state) => state.pwaInstalled);
  const setShowInstallPrompt = useSessionStore((state) => state.setShowInstallPrompt);
  const setPwaInstalled = useSessionStore((state) => state.setPwaInstalled);

  const handleInstall = useCallback(async () => {
    const prompt = getDeferredPrompt();
    if (!prompt) return;
    try {
      await prompt.prompt();
    } catch (err) {
      console.warn('PWA install failed:', err);
    }
    setShowInstallPrompt(false);
    setDeferredPrompt(null);
  }, [setShowInstallPrompt]);

  const handleDismiss = useCallback(() => {
    setShowInstallPrompt(false);
    setDeferredPrompt(null);
  }, [setShowInstallPrompt]);

  useEffect(() => {
    const handleAppInstalled = () => {
      setPwaInstalled(true);
      setShowInstallPrompt(false);
    };
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => window.removeEventListener('appinstalled', handleAppInstalled);
  }, [setPwaInstalled, setShowInstallPrompt]);

  if (!showInstallPrompt || pwaInstalled) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 max-w-sm mx-auto bg-zinc-800 border border-zinc-600 rounded-lg p-4 shadow-xl z-50">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded bg-green-500 flex items-center justify-center text-zinc-900 text-xs font-bold shrink-0">
          <Upload size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 leading-tight">Pasang Regex di layar utama untuk akses cepat.</p>
          <p className="text-xs text-zinc-500 mt-1">Berfungsi offline setelah diinstal.</p>
        </div>
        <div className="flex items-end gap-2 mt-3 pt-3 border-t border-zinc-700">
          <button
            onClick={handleDismiss}
            className="px-3 py-1.5 text-xs rounded border border-zinc-600 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
          >
            <X size={14} className="mr-1" />
            Nanti
          </button>
          <button
            onClick={handleInstall}
            className="px-3 py-1.5 text-xs rounded bg-green-500 text-zinc-900 hover:bg-green-400 transition-colors font-medium"
          >
            <Upload size={14} className="mr-1" />
            Instal
          </button>
        </div>
      </div>
    </div>
  );
}
