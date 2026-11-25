import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RadarView } from './RadarView';
import { useSessionStore } from '../store/useSessionStore';

describe('RadarView', () => {
  beforeEach(() => {
    useSessionStore.setState({
      peers: [],
      selectedPeerId: null,
      connectionStatus: 'searching',
    });
  });

  afterEach(() => {
    useSessionStore.setState({
      peers: [],
      selectedPeerId: null,
      connectionStatus: 'searching',
    });
  });

  it('renders radar container with sonar title', () => {
    render(<RadarView />);
    expect(screen.getByText('Radar')).toBeInTheDocument();
  });

  it('renders peer nodes when peers exist', () => {
    useSessionStore.setState({
      peers: [
        {
          peerId: 'peer-1',
          alias: 'Test Device',
          deviceType: 'desktop',
          os: 'Windows',
          browser: 'Chrome',
          ipHash: 'abc',
          joinedAt: Date.now(),
        },
      ],
    });
    render(<RadarView />);
    expect(screen.getAllByText('Test Device').length).toBeGreaterThan(0);
  });

  it('selects a peer when node is clicked', () => {
    useSessionStore.setState({
      peers: [
        {
          peerId: 'peer-1',
          alias: 'Test Device',
          deviceType: 'desktop',
          os: 'Windows',
          browser: 'Chrome',
          ipHash: 'abc',
          joinedAt: Date.now(),
        },
      ],
    });
    render(<RadarView />);
    const node = screen.getByRole('button', { name: 'Test Device' });
    expect(node).toBeInTheDocument();
    node.click();
    expect(useSessionStore.getState().selectedPeerId).toBe('peer-1');
  });

  it('shows connection status badge', () => {
    useSessionStore.setState({ connectionStatus: 'connected' });
    render(<RadarView />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });
});