import type { SignalingMessage } from './types';

export interface SignalingClient {
  connect(): Promise<void>;
  send(message: SignalingMessage): void;
  onMessage(callback: (msg: SignalingMessage) => void): void;
  close(): void;
  readonly isConnected: boolean;
}

export function createSignalingClient(url: string): SignalingClient {
  let ws: WebSocket | null = null;
  let messageCallbacks: Array<(msg: SignalingMessage) => void> = [];
  let isConnected = false;
  let isClosed = false;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 10;
  const INITIAL_RECONNECT_DELAY = 1000;
  const MAX_RECONNECT_DELAY = 30000;
  let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let connectResolve: (() => void) | null = null;
  let connectReject: ((error: Error) => void) | null = null;

  function clearReconnectTimeout(): void {
    if (reconnectTimeoutId !== null) {
      clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = null;
    }
  }

  function cleanupWebSocket(): void {
    if (ws !== null) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      ws = null;
    }
    clearReconnectTimeout();
  }

  function attemptReconnect(): void {
    if (isClosed || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.warn(`SignalingClient: Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
      }
      if (connectReject !== null) {
        connectReject(new Error('Max reconnect attempts reached'));
        connectReject = null;
        connectResolve = null;
      }
      return;
    }

    const delay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
      MAX_RECONNECT_DELAY
    );
    reconnectAttempts += 1;

    console.log(`SignalingClient: Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    reconnectTimeoutId = setTimeout(() => {
      if (!isClosed) {
        connectInternal();
      }
    }, delay);
  }

  function connectInternal(): void {
    if (isClosed) return;

    ws = new WebSocket(url);

    ws.onopen = () => {
      isConnected = true;
      reconnectAttempts = 0;
      console.log('SignalingClient: Connected');
      if (connectResolve !== null) {
        connectResolve();
        connectResolve = null;
        connectReject = null;
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as unknown;
        if (isSignalingMessage(data)) {
          for (const callback of messageCallbacks) {
            callback(data);
          }
        } else {
          console.warn('SignalingClient: Received invalid message format', data);
        }
      } catch (error) {
        console.error('SignalingClient: Failed to parse message', error);
      }
    };

    ws.onclose = (event: CloseEvent) => {
      const wasConnected = isConnected;
      isConnected = false;
      console.log(`SignalingClient: Disconnected (code: ${event.code}, reason: ${event.reason}, wasClean: ${event.wasClean})`);

      if (connectReject !== null && !wasConnected) {
        connectReject(new Error(`Connection failed: ${event.reason || 'Unknown error'}`));
        connectReject = null;
        connectResolve = null;
      }

      // Only auto-reconnect if we had a successful connection before (wasConnected === true)
      // Initial connection failures should not trigger auto-reconnect; they reject the connect() promise
      if (!isClosed && wasConnected) {
        attemptReconnect();
      }
    };

    ws.onerror = (event: Event) => {
      console.error('SignalingClient: WebSocket error', event);
      if (connectReject !== null && !isConnected) {
        connectReject(new Error('WebSocket connection error'));
        connectReject = null;
        connectResolve = null;
      }
    };
  }

  function isSignalingMessage(data: unknown): data is SignalingMessage {
    if (typeof data !== 'object' || data === null) return false;
    const msg = data as Record<string, unknown>;
    return typeof msg.type === 'string' && [
      'JOIN_LOCAL',
      'JOIN_ROOM',
      'PEER_LIST',
      'PEER_JOINED',
      'PEER_LEFT',
      'SIGNAL'
    ].includes(msg.type);
  }

  return {
    connect(): Promise<void> {
      return new Promise((resolve, reject) => {
        if (isConnected) {
          resolve();
          return;
        }
        if (isClosed) {
          reject(new Error('SignalingClient is closed'));
          return;
        }
        connectResolve = resolve;
        connectReject = reject;
        connectInternal();
      });
    },

    send(message: SignalingMessage): void {
      if (!isConnected || ws === null || ws.readyState !== WebSocket.OPEN) {
        console.warn('SignalingClient: Cannot send message, not connected');
        return;
      }
      ws.send(JSON.stringify(message));
    },

    onMessage(callback: (msg: SignalingMessage) => void): void {
      messageCallbacks.push(callback);
    },

    close(): void {
      isClosed = true;
      // Reject pending connection promise if any
      if (connectReject !== null) {
        connectReject(new Error('SignalingClient is closed'));
        connectReject = null;
        connectResolve = null;
      }
      clearReconnectTimeout();
      cleanupWebSocket();
      messageCallbacks = [];
      isConnected = false;
    },

    get isConnected(): boolean {
      return isConnected;
    }
  };
}