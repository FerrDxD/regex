import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CHUNK_SIZE,
  BACKPRESSURE_THRESHOLD,
  sendFile,
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

class TestDataChannel {
  bufferedAmount = 0;
  binaryType: BinaryType = 'arraybuffer';
  onbufferedamountlow: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  sentBuffers: ArrayBuffer[] = [];

  send(data: ArrayBuffer): void {
    this.sentBuffers.push(data);
  }

  triggerLow(): void {
    this.onbufferedamountlow?.(new Event('bufferedamountlow'));
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