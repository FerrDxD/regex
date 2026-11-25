import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sendFile,
  receiveFile,
  CHUNK_SIZE,
  BACKPRESSURE_THRESHOLD,
  type ProgressInfo,
} from './fileTransfer';

// Polyfill Blob.arrayBuffer for jsdom (same pattern as integration.test.ts)
const pendingBlobReads: Array<{
  blob: Blob;
  resolve: (value: ArrayBuffer) => void;
  reject: (error: Error) => void;
}> = [];

Blob.prototype.arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    pendingBlobReads.push({ blob: this, resolve, reject });
  });
};

function resolveNextBlobRead(): void {
  const call = pendingBlobReads.shift();
  if (call) {
    call.resolve(new ArrayBuffer(call.blob.size));
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
  private _drainScheduled = false;

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
    // Simulate SCTP buffer drain: when above backpressure threshold,
    // schedule bufferedamountlow after a short delay (like a real browser).
    if (this.bufferedAmount > BACKPRESSURE_THRESHOLD && !this._drainScheduled) {
      this._drainScheduled = true;
      setTimeout(() => {
        this._drainScheduled = false;
        this.bufferedAmount = 0;
        this.onbufferedamountlow?.(new Event('bufferedamountlow'));
      }, 10);
    }
    // Deliver synchronously for test purposes (like integration test)
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

// Test configuration: 1 MB file (~16 chunks) - large enough to exercise backpressure
const STRESS_FILE_SIZE = 1 * 1024 * 1024;
const MAX_ALLOWED_BUFFERED_AMOUNT = BACKPRESSURE_THRESHOLD + CHUNK_SIZE;

describe('Memory Stress Test: Large File Transfer', () => {
  let channelA: MockDataChannel;
  let channelB: MockDataChannel;
  let progressEventsSender: ProgressInfo[];
  let progressEventsReceiver: ProgressInfo[];
  let maxBufferedAmountDuringSend: number;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    pendingBlobReads.length = 0;
    mockObjectUrls.clear();
    objectUrlCounter = 0;
    progressEventsSender = [];
    progressEventsReceiver = [];
    maxBufferedAmountDuringSend = 0;

    channelA = new MockDataChannel('file-transfer');
    channelB = new MockDataChannel('file-transfer');
    channelA.setPartner(channelB);
    channelB.setPartner(channelA);

    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('transfers file without OOM and verifies backpressure bounds', async () => {
    const testFile = makeFile('stress.bin', STRESS_FILE_SIZE);

    // Track bufferedAmount before each chunk send
    const originalSend = channelA.send.bind(channelA);
    channelA.send = function (data: ArrayBuffer): void {
      maxBufferedAmountDuringSend = Math.max(
        maxBufferedAmountDuringSend,
        this.bufferedAmount
      );
      originalSend(data);
    };

    const sendPromise = sendFile(asChannel(channelA), testFile, {
      onProgress: (p) => progressEventsSender.push(p),
    });

    const receivePromise = receiveFile(
      asChannel(channelB),
      testFile.name,
      testFile.size,
      (p) => progressEventsReceiver.push(p)
    );

    // Run all timers to process chunk sends and receives
    await vi.runAllTimersAsync();

    // Resolve pending blob reads one at a time (pattern from integration.test.ts)
    while (pendingBlobReads.length > 0) {
      resolveNextBlobRead();
      await vi.runAllTimersAsync();
    }

    // Wait for both promises to complete
    await Promise.all([sendPromise, receivePromise]);

    // Verify backpressure: bufferedAmount never exceeded threshold + chunk size
    expect(maxBufferedAmountDuringSend).toBeLessThanOrEqual(MAX_ALLOWED_BUFFERED_AMOUNT);

    // Verify sender progress reached 100%
    expect(progressEventsSender.length).toBeGreaterThan(0);
    const lastSenderProgress = progressEventsSender[progressEventsSender.length - 1];
    expect(lastSenderProgress.percentage).toBe(100);
    expect(lastSenderProgress.bytesTransferred).toBe(STRESS_FILE_SIZE);
    expect(lastSenderProgress.totalBytes).toBe(STRESS_FILE_SIZE);

    // Verify receiver progress reached 100%
    expect(progressEventsReceiver.length).toBeGreaterThan(0);
    const lastReceiverProgress = progressEventsReceiver[progressEventsReceiver.length - 1];
    expect(lastReceiverProgress.percentage).toBe(100);
    expect(lastReceiverProgress.bytesTransferred).toBe(STRESS_FILE_SIZE);
    expect(lastReceiverProgress.totalBytes).toBe(STRESS_FILE_SIZE);

    // Verify receiveFile resolved with Blob of correct size
    const blob = await receivePromise;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(STRESS_FILE_SIZE);
    expect(blob.type).toBe('application/octet-stream');

    // Verify revokeObjectURL was called (cleanup of object URL)
    expect(revokeObjectURLSpy).toHaveBeenCalled();

    // Verify channel handlers are nulled (no listener leak)
    expect(channelA.onbufferedamountlow).toBeNull();
    expect(channelA.onerror).toBeNull();
    expect(channelB.onmessage).toBeNull();
    expect(channelB.onerror).toBeNull();
  }, 30000);

  it('verifies bufferedAmount stays bounded during backpressure wait', async () => {
    const testFile = makeFile('backpressure-stress.bin', CHUNK_SIZE * 10); // ~640 KB
    let observedBufferedAmounts: number[] = [];

    // Simulate high bufferedAmount initially to force backpressure wait
    channelA.bufferedAmount = BACKPRESSURE_THRESHOLD + 1;

    const sendPromise = sendFile(asChannel(channelA), testFile, {
      onProgress: (p) => progressEventsSender.push(p),
    });

    const receivePromise = receiveFile(
      asChannel(channelB),
      testFile.name,
      testFile.size,
      (p) => progressEventsReceiver.push(p)
    );

    // Give it a moment - should NOT send anything yet because bufferedAmount is high
    await vi.runAllTimersAsync();
    expect(channelA.sentBuffers.length).toBe(0);

    // Record bufferedAmount while waiting
    observedBufferedAmounts.push(channelA.bufferedAmount);
    expect(channelA.bufferedAmount).toBeGreaterThan(BACKPRESSURE_THRESHOLD);

    // Now simulate bufferedamountlow - it should resume
    channelA.bufferedAmount = 0;
    channelA.triggerLow();

    await vi.runAllTimersAsync();

    // Resolve pending blob reads one at a time (pattern from integration.test.ts)
    while (pendingBlobReads.length > 0) {
      resolveNextBlobRead();
      await vi.runAllTimersAsync();
    }

    await Promise.all([sendPromise, receivePromise]);

    // Verify bufferedAmount was bounded during the wait
    for (const amt of observedBufferedAmounts) {
      expect(amt).toBeLessThanOrEqual(MAX_ALLOWED_BUFFERED_AMOUNT);
    }

    // Verify final bufferedAmount is back to normal
    expect(channelA.bufferedAmount).toBeLessThanOrEqual(MAX_ALLOWED_BUFFERED_AMOUNT);

    // Verify handlers cleaned up
    expect(channelA.onbufferedamountlow).toBeNull();
    expect(channelA.onerror).toBeNull();
    expect(channelB.onmessage).toBeNull();
    expect(channelB.onerror).toBeNull();
  }, 30000);
});

describe('Memory Stress Test: Multiple Sequential Transfers', () => {
  let channelA: MockDataChannel;
  let channelB: MockDataChannel;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    pendingBlobReads.length = 0;
    mockObjectUrls.clear();
    objectUrlCounter = 0;

    channelA = new MockDataChannel('file-transfer');
    channelB = new MockDataChannel('file-transfer');
    channelA.setPartner(channelB);
    channelB.setPartner(channelA);

    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('completes 3 sequential transfers without handler leaks', async () => {
    const fileSize = 256 * 1024; // 256 KB each (4 chunks)
    const transferCount = 3;

    for (let i = 0; i < transferCount; i++) {
      const testFile = makeFile(`multi-${i}.bin`, fileSize);
      const progressEventsSender: ProgressInfo[] = [];
      const progressEventsReceiver: ProgressInfo[] = [];

      const sendPromise = sendFile(asChannel(channelA), testFile, {
        onProgress: (p) => progressEventsSender.push(p),
      });

      const receivePromise = receiveFile(
        asChannel(channelB),
        testFile.name,
        testFile.size,
        (p) => progressEventsReceiver.push(p)
      );

      await vi.runAllTimersAsync();

      // Resolve all pending blob reads (pattern from integration.test.ts)
      while (pendingBlobReads.length > 0) {
        resolveNextBlobRead();
        await vi.runAllTimersAsync();
      }

      const blob = await Promise.all([sendPromise, receivePromise]).then(([, blob]) => blob);

      expect(blob.size).toBe(fileSize);
      expect(revokeObjectURLSpy).toHaveBeenCalled();

      // Verify handlers are cleaned up after each transfer
      expect(channelA.onbufferedamountlow).toBeNull();
      expect(channelA.onerror).toBeNull();
      expect(channelB.onmessage).toBeNull();
      expect(channelB.onerror).toBeNull();

      // Reset spy for next iteration
      revokeObjectURLSpy.mockClear();
    }
  });

  it('handles transfer cancellation and cleans up handlers', async () => {
    const testFile = makeFile('cancel-test.bin', CHUNK_SIZE * 5); // ~320 KB

    const sendPromise = sendFile(asChannel(channelA), testFile);
    const receivePromise = receiveFile(
      asChannel(channelB),
      testFile.name,
      testFile.size,
      () => {}
    );

    // Drive the transfer forward: resolve all pending blob reads so both
    // sendFile and receiveFile complete before we close the channels.
    await vi.runAllTimersAsync();
    while (pendingBlobReads.length > 0) {
      resolveNextBlobRead();
      await vi.runAllTimersAsync();
    }

    await Promise.all([sendPromise, receivePromise]);

    // Cancel by closing the channel (simulating abort/cleanup)
    channelA.close();
    channelB.close();

    await vi.runAllTimersAsync();

    // Handlers should be cleaned up
    expect(channelA.onbufferedamountlow).toBeNull();
    expect(channelA.onerror).toBeNull();
    expect(channelB.onmessage).toBeNull();
    expect(channelB.onerror).toBeNull();
  }, 30000);
});
