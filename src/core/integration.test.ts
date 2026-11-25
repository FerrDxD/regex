import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sendControlMessage,
  receiveControlMessage,
  parseControlMessage,
  createTransferOffer,
  createTransferAccept,
  createFileComplete,
  createTransferDecline,
  type P2PControlMessage,
} from './controlProtocol';
import { sendFile, receiveFile, CHUNK_SIZE, BACKPRESSURE_THRESHOLD, type ProgressInfo } from './fileTransfer';
import type { FileMeta } from './types';

// Polyfill Blob.arrayBuffer for jsdom
const pendingBlobReads: Array<{ blob: Blob; resolve: (value: ArrayBuffer) => void; reject: (error: Error) => void }> = [];

Blob.prototype.arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    pendingBlobReads.push({ blob: this, resolve, reject });
  });
};

function resolveNextBlobRead(buffer?: ArrayBuffer): void {
  const call = pendingBlobReads.shift();
  if (call) {
    call.resolve(buffer ?? new ArrayBuffer(call.blob.size));
  }
}

// Mock URL.createObjectURL and revokeObjectURL for jsdom
const mockObjectUrls = new Map<string, Blob>();
let objectUrlCounter = 0;

const mockCreateObjectURL = vi.fn((blob: Blob): string => {
  const url = `blob:mock/${++objectUrlCounter}`;
  mockObjectUrls.set(url, blob);
  return url;
});
const mockRevokeObjectURL = vi.fn((url: string): void => {
  mockObjectUrls.delete(url);
});

Object.defineProperty(globalThis, 'URL', {
  value: {
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  },
  configurable: true,
});

// Mock document for download
const mockClick = vi.fn();
const mockAppendChild = vi.fn();
const mockRemoveChild = vi.fn();
const mockCreateElement = vi.fn(() => ({
  href: '',
  download: '',
  style: { display: '' },
  click: mockClick,
}));

Object.defineProperty(globalThis, 'document', {
  value: {
    createElement: mockCreateElement,
    body: {
      appendChild: mockAppendChild,
      removeChild: mockRemoveChild,
    },
  },
  configurable: true,
});

class MockDataChannel {
  label: string;
  binaryType: BinaryType = 'arraybuffer';
  bufferedAmount = 0;
  onbufferedamountlow: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  sentBuffers: ArrayBuffer[] = [];
  private _readyState: RTCDataChannelState = 'open';
  private _partner: MockDataChannel | null = null;

  constructor(label: string) {
    this.label = label;
  }

  get readyState(): RTCDataChannelState {
    return this._readyState;
  }

  setPartner(partner: MockDataChannel): void {
    this._partner = partner;
  }

  send(data: ArrayBuffer): void {
    if (this._readyState !== 'open') {
      throw new Error('Data channel not open');
    }
    this.sentBuffers.push(data);
    this.bufferedAmount += data.byteLength;
    // Deliver synchronously for control messages (which are small)
    // For file chunks, the fileTransfer tests handle delivery differently
    if (this._partner && this._partner._readyState === 'open') {
      this._partner.onmessage?.(new MessageEvent('message', { data }));
    }
  }

  triggerLow(): void {
    this.bufferedAmount = 0;
    this.onbufferedamountlow?.(new Event('bufferedamountlow'));
  }

  close(): void {
    this._readyState = 'closed';
  }
}

function makeFile(name: string, size: number): File {
  const uint8 = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    uint8[i] = i % 256;
  }
  return new File([uint8], name);
}

const asChannel = (ch: MockDataChannel): RTCDataChannel => ch as unknown as RTCDataChannel;

describe('Integration: Signaling + WebRTC + File Transfer (end-to-end)', () => {
  let channelA: MockDataChannel;
  let channelB: MockDataChannel;
  let receivedControlMessagesA: P2PControlMessage[] = [];
  let receivedControlMessagesB: P2PControlMessage[] = [];
  let cleanupReceiveA: () => void;
  let cleanupReceiveB: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    pendingBlobReads.length = 0;
    mockObjectUrls.clear();
    objectUrlCounter = 0;
    receivedControlMessagesA = [];
    receivedControlMessagesB = [];

    // Create mock data channels directly for integration testing
    channelA = new MockDataChannel('file-transfer');
    channelB = new MockDataChannel('file-transfer');

    channelA.setPartner(channelB);
    channelB.setPartner(channelA);

    // Set up control message receivers FIRST (before any sends)
    cleanupReceiveA = receiveControlMessage(
      asChannel(channelA),
      (msg) => receivedControlMessagesA.push(msg)
    );
    cleanupReceiveB = receiveControlMessage(
      asChannel(channelB),
      (msg) => receivedControlMessagesB.push(msg)
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    cleanupReceiveA?.();
    cleanupReceiveB?.();
  });

  describe('Full P2P flow: TRANSFER_OFFER → TRANSFER_ACCEPT → sendFile → receiveFile → FILE_COMPLETE', () => {
    it('completes end-to-end file transfer with control messages', async () => {
      const fileSize = CHUNK_SIZE * 2 + 100; // ~131 KB
      const testFile = makeFile('test-file.bin', fileSize);

      // --- Step 1: Sender creates TRANSFER_OFFER ---
      const fileMeta: FileMeta = {
        fileId: 'file-123',
        name: testFile.name,
        size: testFile.size,
        type: testFile.type || 'application/octet-stream',
        chunkCount: Math.ceil(testFile.size / CHUNK_SIZE),
      };

      const offerMsg = createTransferOffer([fileMeta], 'peer-A');
      sendControlMessage(asChannel(channelA), offerMsg);

      // Verify offer received by receiver
      await vi.runAllTimersAsync();
      expect(receivedControlMessagesB).toHaveLength(1);
      expect(receivedControlMessagesB[0].type).toBe('TRANSFER_OFFER');
      expect((receivedControlMessagesB[0] as { type: 'TRANSFER_OFFER'; files: FileMeta[] }).files).toHaveLength(1);
      expect((receivedControlMessagesB[0] as { type: 'TRANSFER_OFFER'; files: FileMeta[] }).files[0].fileId).toBe('file-123');

      // --- Step 2: Receiver accepts with TRANSFER_ACCEPT ---
      const acceptMsg = createTransferAccept('file-123', 'peer-B');
      sendControlMessage(asChannel(channelB), acceptMsg);

      // Verify accept received by sender
      await vi.runAllTimersAsync();
      expect(receivedControlMessagesA).toHaveLength(1);
      expect(receivedControlMessagesA[0].type).toBe('TRANSFER_ACCEPT');
      expect((receivedControlMessagesA[0] as { type: 'TRANSFER_ACCEPT'; fileId: string }).fileId).toBe('file-123');
      expect((receivedControlMessagesA[0] as { type: 'TRANSFER_ACCEPT'; receiverId: string }).receiverId).toBe('peer-B');

      // --- Step 3: Sender starts sending file ---
      const progressEventsSender: ProgressInfo[] = [];
      const sendPromise = sendFile(
        asChannel(channelA),
        testFile,
        { onProgress: (p) => progressEventsSender.push(p) }
      );

      // --- Step 4: Receiver receives file ---
      const progressEventsReceiver: ProgressInfo[] = [];
      const receivePromise = receiveFile(
        asChannel(channelB),
        testFile.name,
        testFile.size,
        (p) => progressEventsReceiver.push(p)
      );

      // Run all timers to process chunk sends and receives
      await vi.runAllTimersAsync();

      // Resolve all pending blob reads
      while (pendingBlobReads.length > 0) {
        resolveNextBlobRead();
        await vi.runAllTimersAsync();
      }

      // Wait for both promises to complete
      await Promise.all([sendPromise, receivePromise]);

      // --- Step 5: Receiver sends FILE_COMPLETE after successful receive ---
      const completeMsg = createFileComplete('file-123', 'peer-B');
      sendControlMessage(asChannel(channelB), completeMsg);

      await vi.runAllTimersAsync();
      expect(receivedControlMessagesA).toHaveLength(2); // ACCEPT + FILE_COMPLETE
      const fileCompleteMsg = receivedControlMessagesA[1];
      expect(fileCompleteMsg.type).toBe('FILE_COMPLETE');
      expect((fileCompleteMsg as { type: 'FILE_COMPLETE'; fileId: string }).fileId).toBe('file-123');
      expect((fileCompleteMsg as { type: 'FILE_COMPLETE'; receiverId: string }).receiverId).toBe('peer-B');

      // --- Verify sender progress ---
      expect(progressEventsSender.length).toBeGreaterThan(0);
      const lastSenderProgress = progressEventsSender[progressEventsSender.length - 1];
      expect(lastSenderProgress.percentage).toBe(100);
      expect(lastSenderProgress.bytesTransferred).toBe(fileSize);
      expect(lastSenderProgress.totalBytes).toBe(fileSize);

      // --- Verify receiver progress ---
      expect(progressEventsReceiver.length).toBeGreaterThan(0);
      const lastReceiverProgress = progressEventsReceiver[progressEventsReceiver.length - 1];
      expect(lastReceiverProgress.percentage).toBe(100);
      expect(lastReceiverProgress.bytesTransferred).toBe(fileSize);
      expect(lastReceiverProgress.totalBytes).toBe(fileSize);

      // --- Verify data integrity ---
      // sentBuffers includes both control messages and file chunks
      // Control messages (TRANSFER_OFFER, TRANSFER_ACCEPT, FILE_COMPLETE) are sent first and are small (~100-200 bytes)
      // File chunks follow: 2 full CHUNK_SIZE chunks + 1 partial chunk (100 bytes)
      const controlMessageCount = 1; // Only TRANSFER_OFFER sent from channelA before file transfer
      const fileChunkBuffers = channelA.sentBuffers.slice(controlMessageCount);
      const fileChunkBytes = fileChunkBuffers.reduce((sum, buf) => sum + buf.byteLength, 0);
      expect(fileChunkBytes).toBe(fileSize);
    });

    it('handles TRANSFER_DECLINE correctly', async () => {
      const fileMeta: FileMeta = {
        fileId: 'file-456',
        name: 'declined.txt',
        size: 100,
        type: 'text/plain',
        chunkCount: 1,
      };

      const offerMsg = createTransferOffer([fileMeta], 'peer-A');
      sendControlMessage(asChannel(channelA), offerMsg);

      await vi.runAllTimersAsync();
      expect(receivedControlMessagesB).toHaveLength(1);
      expect(receivedControlMessagesB[0].type).toBe('TRANSFER_OFFER');

      // Receiver declines
      const declineMsg = createTransferDecline('file-456', 'peer-B');
      sendControlMessage(asChannel(channelB), declineMsg);

      await vi.runAllTimersAsync();
      expect(receivedControlMessagesA).toHaveLength(1);
      expect(receivedControlMessagesA[0].type).toBe('TRANSFER_DECLINE');
      expect((receivedControlMessagesA[0] as { type: 'TRANSFER_DECLINE'; fileId: string }).fileId).toBe('file-456');
    });

    it('resets state cleanly after transfer completion', async () => {
      const fileSize = CHUNK_SIZE + 50;
      const testFile = makeFile('reset-test.bin', fileSize);

      const fileMeta: FileMeta = {
        fileId: 'file-789',
        name: testFile.name,
        size: testFile.size,
        type: testFile.type || 'application/octet-stream',
        chunkCount: Math.ceil(testFile.size / CHUNK_SIZE),
      };

      // First transfer
      const offerMsg = createTransferOffer([fileMeta], 'peer-A');
      sendControlMessage(asChannel(channelA), offerMsg);
      await vi.runAllTimersAsync();

      const acceptMsg = createTransferAccept('file-789', 'peer-B');
      sendControlMessage(asChannel(channelB), acceptMsg);
      await vi.runAllTimersAsync();

      const sendPromise1 = sendFile(asChannel(channelA), testFile);
      const receivePromise1 = receiveFile(asChannel(channelB), testFile.name, testFile.size, () => {});
      await vi.runAllTimersAsync();
      while (pendingBlobReads.length > 0) {
        resolveNextBlobRead();
        await vi.runAllTimersAsync();
      }
      await Promise.all([sendPromise1, receivePromise1]);

      // Receiver sends FILE_COMPLETE
      const completeMsg1 = createFileComplete('file-789', 'peer-B');
      sendControlMessage(asChannel(channelB), completeMsg1);
      await vi.runAllTimersAsync();

      // Verify FILE_COMPLETE received
      expect(receivedControlMessagesA.some(m => m.type === 'FILE_COMPLETE')).toBe(true);

      // --- Now simulate second transfer (state should be clean) ---
      const fileMeta2: FileMeta = {
        fileId: 'file-790',
        name: 'second-file.bin',
        size: CHUNK_SIZE,
        type: 'application/octet-stream',
        chunkCount: 1,
      };

      const testFile2 = makeFile('second-file.bin', CHUNK_SIZE);

      const offerMsg2 = createTransferOffer([fileMeta2], 'peer-A');
      sendControlMessage(asChannel(channelA), offerMsg2);
      await vi.runAllTimersAsync();

      const acceptMsg2 = createTransferAccept('file-790', 'peer-B');
      sendControlMessage(asChannel(channelB), acceptMsg2);
      await vi.runAllTimersAsync();

      const sendPromise2 = sendFile(asChannel(channelA), testFile2);
      const receivePromise2 = receiveFile(asChannel(channelB), testFile2.name, testFile2.size, () => {});
      await vi.runAllTimersAsync();
      while (pendingBlobReads.length > 0) {
        resolveNextBlobRead();
        await vi.runAllTimersAsync();
      }
      await Promise.all([sendPromise2, receivePromise2]);

      // Receiver sends FILE_COMPLETE for second transfer
      const completeMsg2 = createFileComplete('file-790', 'peer-B');
      sendControlMessage(asChannel(channelB), completeMsg2);
      await vi.runAllTimersAsync();

      // Verify second FILE_COMPLETE
      const fileCompleteCount = receivedControlMessagesA.filter(m => m.type === 'FILE_COMPLETE').length;
      expect(fileCompleteCount).toBe(2);
    });

    it('handles backpressure correctly during transfer', async () => {
      const fileSize = CHUNK_SIZE * 5; // ~320 KB
      const testFile = makeFile('backpressure-test.bin', fileSize);

      const fileMeta: FileMeta = {
        fileId: 'file-bp',
        name: testFile.name,
        size: testFile.size,
        type: testFile.type || 'application/octet-stream',
        chunkCount: Math.ceil(testFile.size / CHUNK_SIZE),
      };

      const offerMsg = createTransferOffer([fileMeta], 'peer-A');
      sendControlMessage(asChannel(channelA), offerMsg);
      await vi.runAllTimersAsync();

      const acceptMsg = createTransferAccept('file-bp', 'peer-B');
      sendControlMessage(asChannel(channelB), acceptMsg);
      await vi.runAllTimersAsync();

      // Control messages already sent: 1 in channelA (TRANSFER_OFFER), 1 in channelB (TRANSFER_ACCEPT)
      const initialSentCount = channelA.sentBuffers.length;
      expect(initialSentCount).toBe(1);

      // Simulate high bufferedAmount on sender side
      channelA.bufferedAmount = BACKPRESSURE_THRESHOLD + 1;

      const sendPromise = sendFile(asChannel(channelA), testFile);
      const receivePromise = receiveFile(asChannel(channelB), testFile.name, testFile.size, () => {});

      // Give it a moment — it should NOT have sent anything yet because bufferedAmount is high
      await vi.runAllTimersAsync();
      // Should not have sent any FILE CHUNKS (control messages don't count)
      expect(channelA.sentBuffers.length).toBe(initialSentCount);

      // Now simulate bufferedamountlow — it should resume
      channelA.bufferedAmount = 0;
      channelA.triggerLow();

      await vi.runAllTimersAsync();
      while (pendingBlobReads.length > 0) {
        resolveNextBlobRead();
        await vi.runAllTimersAsync();
      }

      await Promise.all([sendPromise, receivePromise]);
      await vi.runAllTimersAsync();

      // Only count file chunks (large buffers), not control messages
      const fileChunks = channelA.sentBuffers.filter(buf => buf.byteLength > 200);
      expect(fileChunks.length).toBe(5); // 5 chunks for 320 KB file
    });
  });

  describe('parseControlMessage integration', () => {
    it('correctly parses all control message types from wire format', () => {
      const offer = createTransferOffer([{
        fileId: 'f1',
        name: 'test.txt',
        size: 100,
        type: 'text/plain',
        chunkCount: 1,
      }], 'sender');
      const offerRaw = JSON.stringify(offer);
      expect(parseControlMessage(offerRaw)).toEqual(offer);

      const accept = createTransferAccept('f1', 'receiver');
      const acceptRaw = JSON.stringify(accept);
      expect(parseControlMessage(acceptRaw)).toEqual(accept);

      const decline = createTransferDecline('f1', 'receiver');
      const declineRaw = JSON.stringify(decline);
      expect(parseControlMessage(declineRaw)).toEqual(decline);

      const complete = createFileComplete('f1', 'receiver');
      const completeRaw = JSON.stringify(complete);
      expect(parseControlMessage(completeRaw)).toEqual(complete);
    });
  });
});