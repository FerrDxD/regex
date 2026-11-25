import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createZip, downloadZip } from './zipUtils';

// Mock document and URL for downloadZip tests
const mockClick = vi.fn();
const mockAppendChild = vi.fn();
const mockRemoveChild = vi.fn();
const mockCreateElement = vi.fn(() => ({
  href: '',
  download: '',
  style: { display: '' },
  click: mockClick,
}));
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = vi.fn();

beforeEach(() => {
  vi.stubGlobal('document', {
    createElement: mockCreateElement,
    body: {
      appendChild: mockAppendChild,
      removeChild: mockRemoveChild,
    },
  });
  vi.stubGlobal('URL', {
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createZip', () => {
  it('produces a zip blob containing all files', async () => {
    const zipBlob = await createZip([
      { name: 'a.txt', blob: new Blob(['hello']) },
      { name: 'b.txt', blob: new Blob(['world']) },
    ]);
    expect(zipBlob).toBeInstanceOf(Blob);
    expect(zipBlob.size).toBeGreaterThan(0);
  });

  it('creates a zip that can be read back with correct file contents', async () => {
    const zipBlob = await createZip([
      { name: 'a.txt', blob: new Blob(['hello']) },
      { name: 'b.txt', blob: new Blob(['world']) },
    ]);

    // Read back the zip to verify contents
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(zipBlob);

    expect(Object.keys(zip.files).sort()).toEqual(['a.txt', 'b.txt']);

    const aContent = await zip.files['a.txt'].async('text');
    const bContent = await zip.files['b.txt'].async('text');

    expect(aContent).toBe('hello');
    expect(bContent).toBe('world');
  });

  it('handles empty file array', async () => {
    const zipBlob = await createZip([]);
    expect(zipBlob).toBeInstanceOf(Blob);
    expect(zipBlob.size).toBeGreaterThan(0); // Empty zip still has some bytes
  });

  it('handles files with special characters in names', async () => {
    const zipBlob = await createZip([
      { name: 'file with spaces.txt', blob: new Blob(['content']) },
      { name: 'файл.txt', blob: new Blob(['кириллица']) },
      { name: 'file-测试.txt', blob: new Blob(['测试']) },
    ]);

    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(zipBlob);

    expect(zip.files['file with spaces.txt']).toBeDefined();
    expect(zip.files['файл.txt']).toBeDefined();
    expect(zip.files['file-测试.txt']).toBeDefined();
  });

  it('handles binary blob content', async () => {
    const binaryData = new Uint8Array([0, 1, 2, 3, 255, 254, 253]);
    const zipBlob = await createZip([
      { name: 'binary.bin', blob: new Blob([binaryData]) },
    ]);

    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(zipBlob);
    const content = await zip.files['binary.bin'].async('uint8array');

    expect(content).toEqual(binaryData);
  });
});

describe('downloadZip', () => {
  it('creates object URL, triggers download, and revokes URL', () => {
    const zipBlob = new Blob(['zip content'], { type: 'application/zip' });
    const fileName = 'test.zip';

    downloadZip(zipBlob, fileName);

    expect(mockCreateObjectURL).toHaveBeenCalledWith(zipBlob);
    expect(mockCreateElement).toHaveBeenCalledWith('a');
    expect(mockAppendChild).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
    expect(mockRemoveChild).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('sets correct download filename on link', () => {
    const zipBlob = new Blob(['zip content'], { type: 'application/zip' });
    const fileName = 'my-archive.zip';

    downloadZip(zipBlob, fileName);

    // Check that the link element had download attribute set
    const linkArg = mockAppendChild.mock.calls[0][0];
    expect(linkArg.download).toBe(fileName);
    expect(linkArg.href).toBe('blob:mock-url');
  });
});