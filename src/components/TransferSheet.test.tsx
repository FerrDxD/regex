import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransferSheet } from './TransferSheet';
import { useSessionStore } from '../store/useSessionStore';
import type { TransferState } from '../store/useSessionStore';
import type { ProgressInfo } from '../core/fileTransfer';

describe('TransferSheet', () => {
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

  it('renders incoming offer state with accept/decline buttons', () => {
    const transferState: TransferState = {
      direction: 'receiving',
      fileId: 'file-1',
      fileName: 'document.pdf',
      fileSize: 1024 * 1024,
      progress: null,
      abortController: null,
    };

    useSessionStore.setState({ transferState });

    const onAccept = vi.fn();
    const onDecline = vi.fn();

    render(<TransferSheet onAccept={onAccept} onDecline={onDecline} />);

    expect(screen.getByText('document.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /terima|accept/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tolak|decline/i })).toBeInTheDocument();
  });

  it('renders active transfer state with progress bar', () => {
    const progress: ProgressInfo = {
      percentage: 50,
      speedMBps: 2.5,
      etaSeconds: 30,
      bytesTransferred: 250 * 1024,
      totalBytes: 500 * 1024,
    };

    const transferState: TransferState = {
      direction: 'sending',
      fileId: 'file-1',
      fileName: 'image.png',
      fileSize: 500 * 1024,
      progress,
      abortController: null,
    };

    useSessionStore.setState({ transferState });

    render(<TransferSheet />);

    // Check for percentage with one decimal place
    expect(screen.getByText('50.0%')).toBeInTheDocument();
    // Check for speed display (MB/s)
    expect(screen.getByText(/MB\/s/)).toBeInTheDocument();
  });

  it('calls onCancel when cancel button clicked during transfer', () => {
    const onCancel = vi.fn();

    const progress: ProgressInfo = {
      percentage: 0,
      speedMBps: 0,
      etaSeconds: 0,
      bytesTransferred: 0,
      totalBytes: 100,
    };

    const transferState: TransferState = {
      direction: 'sending',
      fileId: 'file-1',
      fileName: 'test.txt',
      fileSize: 100,
      progress,
      abortController: null,
    };

    useSessionStore.setState({ transferState });

    render(<TransferSheet onCancel={onCancel} />);

    const cancelButton = screen.getByRole('button', { name: /batalkan|cancel/i });
    fireEvent.click(cancelButton);

    expect(onCancel).toHaveBeenCalled();
  });
});