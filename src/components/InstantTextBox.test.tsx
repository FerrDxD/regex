import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InstantTextBox } from './InstantTextBox';
import { useSessionStore } from '../store/useSessionStore';

describe('InstantTextBox', () => {
  beforeEach(() => {
    useSessionStore.setState({ clipboardText: '' });
    vi.clearAllMocks();
  });

  afterEach(() => {
    useSessionStore.setState({ clipboardText: '' });
  });

  it('renders text input and send button', () => {
    render(<InstantTextBox onSend={vi.fn()} />);

    const textarea = screen.getByPlaceholderText(/ketik pesan|type message/i);
    expect(textarea).toBeInTheDocument();

    const sendButton = screen.getByRole('button', { name: /kirim|send/i });
    expect(sendButton).toBeInTheDocument();
  });

  it('calls onSend with input value when send button clicked', () => {
    const onSend = vi.fn();
    render(<InstantTextBox onSend={onSend} />);

    const textarea = screen.getByPlaceholderText(/ketik pesan|type message/i);
    fireEvent.change(textarea, { target: { value: 'hello world' } });

    const sendButton = screen.getByRole('button', { name: /kirim|send/i });
    fireEvent.click(sendButton);

    expect(onSend).toHaveBeenCalledWith('hello world');
  });

  it('renders received URL as safe link without dangerouslySetInnerHTML', () => {
    render(<InstantTextBox receivedText="Check https://example.com out" />);

    const link = screen.getByRole('link', { name: 'https://example.com' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders <script> as plain text, not executed', () => {
    render(<InstantTextBox receivedText="<script>alert(1)</script>" />);

    const receivedDiv = screen.getByText('<script>alert(1)</script>');
    expect(receivedDiv).toBeInTheDocument();
  });
});