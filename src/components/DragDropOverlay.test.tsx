import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DragDropOverlay } from './DragDropOverlay';
import { useSessionStore } from '../store/useSessionStore';
import type { PeerMetadata } from '../core/types';

describe('DragDropOverlay', () => {
  const resetStore = () => {
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
  };

  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetStore();
  });

  it('does not render when dragDropActive is false', () => {
    useSessionStore.setState({ dragDropActive: false, selectedPeerId: null });

    render(<DragDropOverlay onDrop={vi.fn()} />);

    expect(screen.queryByText(/lepaskan file/i)).not.toBeInTheDocument();
  });

  it('renders full-screen overlay when dragDropActive is true', () => {
    useSessionStore.setState({ dragDropActive: true });

    render(<DragDropOverlay onDrop={vi.fn()} />);

    expect(screen.getByText(/lepaskan file/i)).toBeInTheDocument();
  });

  it('calls onDrop with files when drop event fired', () => {
    const onDrop = vi.fn();

    useSessionStore.setState({ dragDropActive: true });

    render(<DragDropOverlay onDrop={onDrop} />);

    const file = new File(['hello'], 'test.txt', { type: 'text/plain' });

    const overlayContainer = screen.getByText(/lepaskan file/i).closest('div[role="dialog"]');
    expect(overlayContainer).toBeInTheDocument();

    fireEvent.drop(overlayContainer!, {
      dataTransfer: { files: [file] },
    });

    expect(onDrop).toHaveBeenCalled();
    const calledWith = onDrop.mock.calls[0][0];
    expect(Array.isArray(calledWith)).toBe(true);
    expect(calledWith.length).toBe(1);
    expect(calledWith[0]).toBeInstanceOf(File);
    expect(calledWith[0].name).toBe('test.txt');
  });

  it('displays selected peer alias when available', () => {
    const mockPeer: PeerMetadata = {
      peerId: 'peer-1',
      alias: 'Test Device',
      deviceType: 'desktop',
      os: 'Windows',
      browser: 'Chrome',
      ipHash: 'abc',
      joinedAt: Date.now(),
    };

    useSessionStore.setState({
      dragDropActive: true,
      selectedPeerId: 'peer-1',
      peers: [mockPeer],
    });

    render(<DragDropOverlay onDrop={vi.fn()} />);

    expect(screen.getByText('Test Device')).toBeInTheDocument();
  });

  it('displays fallback "perangkat" when no peer selected', () => {
    useSessionStore.setState({
      dragDropActive: true,
      selectedPeerId: null,
      peers: [],
    });

    render(<DragDropOverlay onDrop={vi.fn()} />);

    expect(screen.getByText('perangkat')).toBeInTheDocument();
  });

  it('dismisses overlay when close button clicked', () => {
    useSessionStore.setState({ dragDropActive: true });

    render(<DragDropOverlay onDrop={vi.fn()} />);

    const closeButton = screen.getByRole('button', { name: /tutup/i });
    expect(closeButton).toBeInTheDocument();

    fireEvent.click(closeButton);

    expect(useSessionStore.getState().dragDropActive).toBe(false);
  });
});