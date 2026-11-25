import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';
import { useSessionStore } from './store/useSessionStore';

// Mock WebSocket for App tests
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  public readonly CONNECTING = 0;
  public readonly OPEN = 1;
  public readonly CLOSING = 2;
  public readonly CLOSED = 3;

  public readyState: number = MockWebSocket.CONNECTING;
  public onopen: ((this: MockWebSocket, ev: Event) => any) | null = null;
  public onmessage: ((this: MockWebSocket, ev: MessageEvent) => any) | null = null;
  public onclose: ((this: MockWebSocket, ev: CloseEvent) => any) | null = null;
  public onerror: ((this: MockWebSocket, ev: Event) => any) | null = null;
  public binaryType: BinaryType = 'blob';
  public bufferedAmount: number = 0;
  public extensions: string = '';
  public protocol: string = '';
  public url: string;
  public sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    setTimeout(() => {
      if (this.readyState === MockWebSocket.CONNECTING) {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.(new Event('open'));
      }
    }, 0);
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.readyState === MockWebSocket.OPEN) {
      this.sentMessages.push(typeof data === 'string' ? data : String(data));
    }
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code: code ?? 1000, reason: reason ?? 'Normal closure', wasClean: true }));
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean { return true; }

  simulateMessage(data: unknown): void {
    if (this.readyState === MockWebSocket.OPEN) {
      this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  simulateClose(code = 1000, reason = '', wasClean = true): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code, reason, wasClean }));
  }
}

let originalWebSocket: typeof WebSocket | undefined;

beforeEach(() => {
  originalWebSocket = global.WebSocket;
  // @ts-expect-error - replacing global WebSocket for testing
  global.WebSocket = MockWebSocket;
  vi.useFakeTimers();

  // Reset store to clean state
  useSessionStore.setState({
    peers: [],
    selectedPeerId: null,
    connectionStatus: 'searching',
    transferState: null,
    qrModalOpen: false,
    qrTab: 'host',
    dragDropActive: false,
    clipboardText: '',
  });

  // Mock navigator.clipboard
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      readText: vi.fn().mockResolvedValue('pasted text'),
      writeText: vi.fn().mockResolvedValue(undefined),
    },
    configurable: true,
  });
});

afterEach(() => {
  if (originalWebSocket) {
    global.WebSocket = originalWebSocket;
  }
  vi.useRealTimers();
  vi.restoreAllMocks();

  useSessionStore.setState({
    peers: [],
    selectedPeerId: null,
    connectionStatus: 'searching',
    transferState: null,
    qrModalOpen: false,
    qrTab: 'host',
    dragDropActive: false,
    clipboardText: '',
  });
});

describe('App integration', () => {
  it('renders RadarView header', async () => {
    render(<App />);

    // Advance timers to allow WebSocket connection
    await vi.runAllTimersAsync();

    expect(screen.getByText('Radar')).toBeInTheDocument();
  });

  it('renders InstantTextBox at bottom with placeholder', async () => {
    render(<App />);

    await vi.runAllTimersAsync();

    const textarea = screen.getByPlaceholderText(/ketik pesan|type message/i);
    expect(textarea).toBeInTheDocument();
  });

  it('opens QR modal when pair button clicked', async () => {
    render(<App />);

    await vi.runAllTimersAsync();

    const pairButton = screen.getByRole('button', { name: /pair|pasang|qr/i });
    expect(pairButton).toBeInTheDocument();

    fireEvent.click(pairButton);

    // QR modal should open and show "Host" tab
    expect(screen.getByText('Host')).toBeInTheDocument();
  });
});