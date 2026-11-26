export type DeferredPrompt = {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

let deferredPrompt: DeferredPrompt | null = null;

export function getDeferredPrompt(): DeferredPrompt | null {
  return deferredPrompt;
}

export function setDeferredPrompt(prompt: DeferredPrompt | null) {
  deferredPrompt = prompt;
}
