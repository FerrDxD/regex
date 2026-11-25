import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QrPairingModal } from './QrPairingModal';
import { useSessionStore } from '../store/useSessionStore';

// Mock html5-qrcode
vi.mock('html5-qrcode', () => {
  const mockStart = vi.fn().mockResolvedValue(undefined);
  const mockStop = vi.fn().mockResolvedValue(undefined);
  const mockClear = vi.fn().mockResolvedValue(undefined);

  return {
    Html5Qrcode: vi.fn().mockImplementation(() => ({
      start: mockStart,
      stop: mockStop,
      clear: mockClear,
    })),
  };
});

// Mock navigator.clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

describe('QrPairingModal', () => {
  beforeEach(() => {
    useSessionStore.setState({
      peers: [],
      selectedPeerId: null,
      connectionStatus: 'searching',
      transferState: null,
      qrModalOpen: true,
      qrTab: 'host',
      dragDropActive: false,
      clipboardText: '',
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    useSessionStore.setState({
      qrModalOpen: false,
      qrTab: 'host',
    });
  });

  it('renders host tab with QR code and 6-digit code', () => {
    render(<QrPairingModal roomId="RX-ABC123" />);

    expect(screen.getByText('Host')).toBeInTheDocument();
    expect(screen.getByText('RX-ABC123')).toBeInTheDocument();
    // QR code SVG should be rendered
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('renders guest tab with manual input', () => {
    useSessionStore.setState({ qrTab: 'guest' });
    render(<QrPairingModal roomId="RX-ABC123" />);

    expect(screen.getByText('Guest')).toBeInTheDocument();
    const input = screen.getByPlaceholderText(/6-digit/i);
    expect(input).toBeInTheDocument();
  });

  it('switches tabs between host and guest', () => {
    render(<QrPairingModal roomId="RX-ABC123" />);

    // Initially on host tab
    expect(useSessionStore.getState().qrTab).toBe('host');
    expect(screen.getByText('RX-ABC123')).toBeInTheDocument();

    // Click Guest tab
    const guestTab = screen.getByRole('button', { name: /guest/i });
    fireEvent.click(guestTab);

    expect(useSessionStore.getState().qrTab).toBe('guest');
    expect(screen.getByPlaceholderText(/6-digit/i)).toBeInTheDocument();

    // Click Host tab
    const hostTab = screen.getByRole('button', { name: /host/i });
    fireEvent.click(hostTab);

    expect(useSessionStore.getState().qrTab).toBe('host');
    expect(screen.getByText('RX-ABC123')).toBeInTheDocument();
  });

  it('closes modal via close button', () => {
    render(<QrPairingModal roomId="RX-ABC123" />);

    expect(useSessionStore.getState().qrModalOpen).toBe(true);

    // Click close button (X icon)
    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);

    expect(useSessionStore.getState().qrModalOpen).toBe(false);
  });
});