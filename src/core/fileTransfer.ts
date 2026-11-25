export const CHUNK_SIZE = 65536;

export const BACKPRESSURE_THRESHOLD = 256 * 1024; // 256 KB
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

export type FileMeta = {
  fileId: string;
  name: string;
  size: number;
  type: string;
  chunkCount: number;
};

export type ProgressInfo = {
  percentage: number;
  speedMBps: number;
  etaSeconds: number;
  bytesTransferred: number;
  totalBytes: number;
};

export type TransferOptions = {
  onProgress?: (p: ProgressInfo) => void;
  onError?: (error: Error) => void;
};

function computeProgress(
  bytesTransferred: number,
  totalBytes: number,
  startTime: number,
): ProgressInfo {
  const elapsed = (Date.now() - startTime) / 1000;
  const percentage = totalBytes > 0 ? (bytesTransferred / totalBytes) * 100 : 0;
  const bytesPerSecond = elapsed > 0 ? bytesTransferred / elapsed : 0;
  const speedMBps = bytesPerSecond / (1024 * 1024);
  const etaSeconds = bytesPerSecond > 0 ? (totalBytes - bytesTransferred) / bytesPerSecond : 0;
  return { percentage, speedMBps, etaSeconds, bytesTransferred, totalBytes };
}

function waitForLowBuffer(channel: RTCDataChannel): Promise<void> {
  if (channel.bufferedAmount <= BACKPRESSURE_THRESHOLD) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const onLow = (): void => {
      channel.onbufferedamountlow = null;
      resolve();
    };
    channel.onbufferedamountlow = onLow;
  });
}

export async function sendFile(
  channel: RTCDataChannel,
  file: File,
  options: TransferOptions = {},
): Promise<void> {
  const { onProgress, onError } = options;

  if (file.size > MAX_FILE_SIZE) {
    const err = new Error(
      `File too large: ${(file.size / (1024 * 1024)).toFixed(1)} MB (max 500 MB)`,
    );
    onError?.(err);
    throw err;
  }

  const totalBytes = file.size;
  const startTime = Date.now();
  let offset = 0;

  const errorHandler = (event: Event): void => {
    const msg = (event as RTCErrorEvent).error?.message ?? 'unknown';
    onError?.(new Error(`Data channel error: ${msg}`));
  };
  channel.onerror = errorHandler;

  try {
    while (offset < totalBytes) {
      await waitForLowBuffer(channel);

      const end = Math.min(offset + CHUNK_SIZE, totalBytes);
      const chunk = file.slice(offset, end);
      const arrayBuffer = await chunk.arrayBuffer();
      channel.send(arrayBuffer);

      offset = end;
      const progress = computeProgress(offset, totalBytes, startTime);
      onProgress?.(progress);
    }

    onProgress?.(computeProgress(totalBytes, totalBytes, startTime));
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    onError?.(error);
    throw error;
  } finally {
    channel.onbufferedamountlow = null;
    channel.onerror = null;
  }
}
