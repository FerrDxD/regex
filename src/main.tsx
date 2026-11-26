import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { useSessionStore } from './store/useSessionStore'

type DeferredPrompt = {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let deferredPrompt: DeferredPrompt | null = null

export function getDeferredPrompt(): DeferredPrompt | null {
  return deferredPrompt
}

export function setDeferredPrompt(prompt: DeferredPrompt | null) {
  deferredPrompt = prompt
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  navigator.serviceWorker
    .register('/sw.js')
    .then((registration) => {
      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing
        if (!installingWorker) return
        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            window.location.reload()
          }
        })
      })
    })
    .catch((err) => {
      console.warn('Service worker registration failed:', err)
    })
}

function setupOnlineStatus() {
  const updateOnlineStatus = () => {
    useSessionStore.getState().setOnlineStatus(navigator.onLine)
  }

  window.addEventListener('online', updateOnlineStatus)
  window.addEventListener('offline', updateOnlineStatus)
  updateOnlineStatus()
}

function setupBeforeInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    setDeferredPrompt(event as unknown as DeferredPrompt)
  })
}

registerServiceWorker()
setupOnlineStatus()
setupBeforeInstallPrompt()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
