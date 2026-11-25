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

export async function receiveFile(
  channel: RTCDataChannel,
  fileName: string,
  fileSize: number,
  onProgress: (p: ProgressInfo) => void,
): Promise<Blob> {
  if (fileSize > MAX_FILE_SIZE) {
    throw new Error(
      `File too large: ${(fileSize / (1024 * 1024)).toFixed(1)} MB (max 500 MB)`,
    );
  }

  const chunks: ArrayBuffer[] = [];
  let bytesReceived = 0;
  const startTime = Date.now();

  return new Promise<Blob>((resolve, reject) => {
    const messageHandler = (event: MessageEvent): void => {
      const data = event.data;
      if (!(data instanceof ArrayBuffer)) {
        return;
      }

      chunks.push(data);
      bytesReceived += data.byteLength;

      const progress = computeProgress(bytesReceived, fileSize, startTime);
      onProgress(progress);

      if (bytesReceived >= fileSize) {
        cleanup();
        try {
          const blob = new Blob(chunks, { type: 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          resolve(blob);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
    };

    const errorHandler = (event: Event): void => {
      const msg = (event as RTCErrorEvent).error?.message ?? 'unknown';
      cleanup();
      reject(new Error(`Data channel error: ${msg}`));
    };

    const cleanup = (): void => {
      channel.onmessage = null;
      channel.onerror = null;
    };

    channel.onmessage = messageHandler;
    channel.onerror = errorHandler;
  });
}
