import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from './useSessionStore';
import type { PeerMetadata } from '../core/types';

const peer: PeerMetadata = {
  peerId: 'peer-123',
  alias: 'Test Peer',
  deviceType: 'desktop',
  os: 'Windows',
  browser: 'Chrome',
  ipHash: 'abc123',
  joinedAt: Date.now(),
};

describe('useSessionStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
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

  it('sets and clears peers', () => {
    useSessionStore.setState({ peers: [peer] });
    expect(useSessionStore.getState().peers).toEqual([peer]);
    useSessionStore.setState({ peers: [] });
    expect(useSessionStore.getState().peers).toEqual([]);
  });

  it('selects and deselects a peer', () => {
    useSessionStore.setState({ selectedPeerId: peer.peerId });
    expect(useSessionStore.getState().selectedPeerId).toBe(peer.peerId);
    useSessionStore.setState({ selectedPeerId: null });
    expect(useSessionStore.getState().selectedPeerId).toBeNull();
  });

  it('sets connection status', () => {
    useSessionStore.setState({ connectionStatus: 'connected' });
    expect(useSessionStore.getState().connectionStatus).toBe('connected');
  });

  it('sets and resets transfer state', () => {
    useSessionStore.setState({
      transferState: {
        direction: 'sending',
        fileId: 'file-1',
        fileName: 'test.txt',
        fileSize: 100,
        progress: { percentage: 50, speedMBps: 1, etaSeconds: 10, bytesTransferred: 50, totalBytes: 100 },
        abortController: null,
      },
    });
    expect(useSessionStore.getState().transferState?.fileName).toBe('test.txt');
    useSessionStore.setState({ transferState: null });
    expect(useSessionStore.getState().transferState).toBeNull();
  });

  it('opens and closes QR modal', () => {
    useSessionStore.setState({ qrModalOpen: true, qrTab: 'guest' });
    expect(useSessionStore.getState().qrModalOpen).toBe(true);
    expect(useSessionStore.getState().qrTab).toBe('guest');
    useSessionStore.setState({ qrModalOpen: false });
    expect(useSessionStore.getState().qrModalOpen).toBe(false);
  });

  it('toggles drag-drop active state', () => {
    useSessionStore.setState({ dragDropActive: true });
    expect(useSessionStore.getState().dragDropActive).toBe(true);
    useSessionStore.setState({ dragDropActive: false });
    expect(useSessionStore.getState().dragDropActive).toBe(false);
  });

  it('sets clipboard text', () => {
    useSessionStore.setState({ clipboardText: 'hello world' });
    expect(useSessionStore.getState().clipboardText).toBe('hello world');
  });
});