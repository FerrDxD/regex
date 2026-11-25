import { useState, useRef, type KeyboardEvent, type ChangeEvent } from 'react';
import { Copy } from 'lucide-react';
import { parseTextSegments, type TextSegment } from '../core/controlProtocol';
import { useSessionStore } from '../store/useSessionStore';

interface InstantTextBoxProps {
  onSend?: (text: string) => void;
  receivedText?: string;
}

function renderSegments(segments: TextSegment[]): React.ReactNode {
  return segments.map((segment, index) => {
    if (segment.type === 'text') {
      return <span key={index}>{segment.content}</span>;
    }
    return (
      <a
        key={index}
        href={segment.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-emerald-400 hover:underline break-all"
      >
        {segment.content}
      </a>
    );
  });
}

export function InstantTextBox({ onSend, receivedText }: InstantTextBoxProps) {
  const [inputValue, setInputValue] = useState('');
  const [rows, setRows] = useState(1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const setClipboardText = useSessionStore((state) => state.setClipboardText);

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    const value = e.target.value;
    setInputValue(value);

    // Auto-grow textarea up to 4 rows
    const lineCount = value.split('\n').length;
    setRows(Math.min(Math.max(lineCount, 1), 4));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputValue.trim() && onSend) {
        onSend(inputValue.trim());
        setInputValue('');
        setRows(1);
      }
    }
  };

  const handleSendClick = (): void => {
    if (inputValue.trim() && onSend) {
      onSend(inputValue.trim());
      setInputValue('');
      setRows(1);
    }
  };

  const handlePaste = (_e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    // Let the default paste happen, then adjust rows
    setTimeout(() => {
      if (textareaRef.current) {
        const lineCount = textareaRef.current.value.split('\n').length;
        setRows(Math.min(Math.max(lineCount, 1), 4));
      }
    }, 0);
  };

  const handleCopyReceived = (): void => {
    if (receivedText) {
      setClipboardText(receivedText);
    }
  };

  const receivedSegments = receivedText ? parseTextSegments(receivedText) : [];

  return (
    <div className="w-full max-w-md mx-auto space-y-3">
      {/* Input area */}
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={rows}
          placeholder="Ketik pesan..."
          className="flex-1 resize-none bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 placeholder-zinc-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-transparent transition-all"
          aria-label="Ketik pesan"
        />
        <button
          onClick={handleSendClick}
          disabled={!inputValue.trim() || !onSend}
          className="flex items-center justify-center px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/30 disabled:cursor-not-allowed text-zinc-900 font-medium text-sm rounded-lg transition-colors"
          aria-label="Kirim"
        >
          Kirim
        </button>
      </div>

      {/* Received message display */}
      {receivedText && (
        <div className="bg-zinc-900/50 border border-zinc-700 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-zinc-400">Diterima</span>
            <button
              onClick={handleCopyReceived}
              className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              aria-label="Salin teks"
            >
              <Copy size={12} />
              <span>Salin</span>
            </button>
          </div>
          <div
            className="font-mono text-sm text-zinc-100 bg-[#09090B] rounded p-3 whitespace-pre-wrap break-words"
          >
            {renderSegments(receivedSegments)}
          </div>
        </div>
      )}
    </div>
  );
}