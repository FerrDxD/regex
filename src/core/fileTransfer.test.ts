import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CHUNK_SIZE,
  BACKPRESSURE_THRESHOLD,
  sendFile,
  receiveFile,
  type ProgressInfo,
  type TransferOptions,
} from './fileTransfer';

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

Object.defineProperty(globalThis, 'URL', {
  value: {
    createObjectURL: vi.fn((blob: Blob): string => {
      const url = `blob:mock/${++objectUrlCounter}`;
      mockObjectUrls.set(url, blob);
      return url;
    }),
    revokeObjectURL: vi.fn((url: string): void => {
      mockObjectUrls.delete(url);
    }),
  },
  configurable: true,
});

class TestDataChannel {
  bufferedAmount = 0;
  binaryType: BinaryType = 'arraybuffer';
  onbufferedamountlow: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  sentBuffers: ArrayBuffer[] = [];

  send(data: ArrayBuffer): void {
    this.sentBuffers.push(data);
  }

  triggerLow(): void {
    this.onbufferedamountlow?.(new Event('bufferedamountlow'));
  }

  triggerMessage(data: ArrayBuffer): void {
    this.onmessage?.(new MessageEvent('message', { data }));
  }
}

function makeFile(name: string, size: number): File {
  const uint8 = new Uint8Array(size);
  return new File([uint8], name);
}

const asChannel = (ch: TestDataChannel): RTCDataChannel => ch as unknown as RTCDataChannel;

describe('CHUNK_SIZE', () => {
  it('is exactly 65536', () => {
    expect(CHUNK_SIZE).toBe(65536);
  });
});

describe('sendFile', () => {
  let channel: TestDataChannel;
  let progressEvents: ProgressInfo[];

  beforeEach(() => {
    channel = new TestDataChannel();
    progressEvents = [];
    pendingBlobReads.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends chunks of CHUNK_SIZE except the last', async () => {
    const file = makeFile('test.bin', CHUNK_SIZE * 2.5);
    const onProgress = vi.fn((p: ProgressInfo) => void progressEvents.push(p));

    const sendPromise = sendFile(asChannel(channel), file, { onProgress });

    await vi.runAllTimersAsync();
    while (pendingBlobReads.length > 0) {
      resolveNextBlobRead();
      await vi.runAllTimersAsync();
    }

    await sendPromise;

    expect(channel.sentBuffers.length).toBe(3);
    expect(channel.sentBuffers[0].byteLength).toBe(CHUNK_SIZE);
    expect(channel.sentBuffers[1].byteLength).toBe(CHUNK_SIZE);
    expect(channel.sentBuffers[2].byteLength).toBe(Math.floor(0.5 * CHUNK_SIZE));
  });

  it('sends ArrayBuffer, not string', async () => {
    const file = makeFile('test.bin', 100);

    const sendPromise = sendFile(asChannel(channel), file);

    await vi.runAllTimersAsync();
    resolveNextBlobRead();
    await vi.runAllTimersAsync();

    await sendPromise;

    expect(channel.sentBuffers.length).toBe(1);
    expect(channel.sentBuffers[0]).toBeInstanceOf(ArrayBuffer);
    expect(typeof channel.sentBuffers[0]).not.toBe('string');
  });

  it('reports progress via onProgress', async () => {
    const file = makeFile('test.bin', CHUNK_SIZE * 2);
    const onProgress = vi.fn((p: ProgressInfo) => void progressEvents.push(p));

    const sendPromise = sendFile(asChannel(channel), file, { onProgress });

    await vi.runAllTimersAsync();
    while (pendingBlobReads.length > 0) {
      resolveNextBlobRead();
      await vi.runAllTimersAsync();
    }

    await sendPromise;

    expect(onProgress).toHaveBeenCalled();
    const last = progressEvents[progressEvents.length - 1];
    expect(last.percentage).toBe(100);
    expect(last.bytesTransferred).toBe(file.size);
    expect(last.totalBytes).toBe(file.size);
    expect(last.speedMBps).toBeGreaterThanOrEqual(0);
    expect(last.etaSeconds).toBeGreaterThanOrEqual(0);
  });

  it('reaches 100% at completion', async () => {
    const file = makeFile('test.bin', CHUNK_SIZE);
    const onProgress = vi.fn();

    const sendPromise = sendFile(asChannel(channel), file, { onProgress });

    await vi.runAllTimersAsync();
    resolveNextBlobRead();
    await vi.runAllTimersAsync();

    await sendPromise;

    const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1][0];
    expect(lastCall.percentage).toBe(100);
  });

  it('rejects files larger than 500 MB', async () => {
    const file = makeFile('large.bin', 100);
    Object.defineProperty(file, 'size', { value: 600 * 1024 * 1024, configurable: true });
    const onError = vi.fn();

    await expect(sendFile(asChannel(channel), file, { onError })).rejects.toThrow(/too large/i);
    expect(onError).toHaveBeenCalled();
    expect(channel.sentBuffers.length).toBe(0);
  });

  it('waits for bufferedamountlow when bufferedAmount is high', async () => {
    const file = makeFile('test.bin', CHUNK_SIZE * 2);

    channel.bufferedAmount = BACKPRESSURE_THRESHOLD + 1;

    const promise = sendFile(asChannel(channel), file);

    // Give it a moment — it should NOT have sent anything yet because bufferedAmount is high
    await vi.runAllTimersAsync();
    expect(channel.sentBuffers.length).toBe(0);

    // Now simulate bufferedamountlow — it should resume
    channel.bufferedAmount = 0;
    channel.triggerLow();

    await vi.runAllTimersAsync();
    while (pendingBlobReads.length > 0) {
      resolveNextBlobRead();
      await vi.runAllTimersAsync();
    }

    await promise;
    expect(channel.sentBuffers.length).toBe(2);
  });

  it('does not wait when bufferedAmount is below threshold', async () => {
    const file = makeFile('test.bin', CHUNK_SIZE);
    channel.bufferedAmount = 1000;

    const sendPromise = sendFile(asChannel(channel), file);

    await vi.runAllTimersAsync();
    resolveNextBlobRead();
    await vi.runAllTimersAsync();

    await sendPromise;
    expect(channel.sentBuffers.length).toBe(1);
  });
});

describe('TransferOptions type', () => {
  it('accepts partial options', () => {
    const opts: TransferOptions = { onProgress: () => {} };
    expect(opts.onProgress).toBeDefined();
    expect(opts.onError).toBeUndefined();
  });
});

describe('receiveFile', () => {
  let channel: TestDataChannel;
  let progressEvents: ProgressInfo[];

  beforeEach(() => {
    channel = new TestDataChannel();
    progressEvents = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('assembles chunks into Blob with correct size', async () => {
    const chunk1 = new ArrayBuffer(100);
    const chunk2 = new ArrayBuffer(200);
    const chunk3 = new ArrayBuffer(50);
    const totalSize = 350;

    const onProgress = vi.fn((p: ProgressInfo) => void progressEvents.push(p));

    const receivePromise = receiveFile(asChannel(channel), 'test.bin', totalSize, onProgress);

    channel.triggerMessage(chunk1);
    await vi.runAllTimersAsync();
    channel.triggerMessage(chunk2);
    await vi.runAllTimersAsync();
    channel.triggerMessage(chunk3);
    await vi.runAllTimersAsync();

    const blob = await receivePromise;

    expect(blob.size).toBe(totalSize);
    expect(blob.type).toBe('application/octet-stream');
    expect(onProgress).toHaveBeenCalled();
  });

  it('reports progress for each chunk', async () => {
    const chunk1 = new ArrayBuffer(100);
    const chunk2 = new ArrayBuffer(200);
    const totalSize = 300;

    const onProgress = vi.fn((p: ProgressInfo) => void progressEvents.push(p));

    const receivePromise = receiveFile(asChannel(channel), 'test.bin', totalSize, onProgress);

    channel.triggerMessage(chunk1);
    await vi.runAllTimersAsync();
    channel.triggerMessage(chunk2);
    await vi.runAllTimersAsync();

    await receivePromise;

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(progressEvents[0].bytesTransferred).toBe(100);
    expect(progressEvents[1].bytesTransferred).toBe(300);
    expect(progressEvents[1].percentage).toBe(100);
  });

  it('rejects files larger than 500 MB', async () => {
    const largeSize = 600 * 1024 * 1024;

    await expect(receiveFile(asChannel(channel), 'large.bin', largeSize, () => {})).rejects.toThrow(/too large/i);
  });

  it('rejects on channel error', async () => {
    const totalSize = 100;

    const receivePromise = receiveFile(asChannel(channel), 'test.bin', totalSize, () => {});

    // Use expect().rejects to catch the rejection properly
    const rejectionPromise = expect(receivePromise).rejects.toThrow(/Data channel error/);

    channel.onerror?.(new Event('error'));
    await vi.runAllTimersAsync();

    await rejectionPromise;
  });

  it('resolves with Blob and triggers download', async () => {
    const chunk = new ArrayBuffer(100);
    const totalSize = 100;

    const receivePromise = receiveFile(asChannel(channel), 'download.bin', totalSize, () => {});

    channel.triggerMessage(chunk);
    await vi.runAllTimersAsync();

    const blob = await receivePromise;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(totalSize);
  });
});