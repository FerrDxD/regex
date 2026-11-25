import JSZip from 'jszip';

export type ZipFile = {
  name: string;
  blob: Blob;
};

/**
 * Creates a ZIP archive containing the provided files.
 * @param files Array of files with name and Blob content
 * @returns Promise resolving to a Blob containing the ZIP archive
 */
export async function createZip(files: ZipFile[]): Promise<Blob> {
  const zip = new JSZip();

  for (const file of files) {
    zip.file(file.name, file.blob);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return zipBlob;
}

/**
 * Triggers a download of the provided ZIP blob.
 * @param zipBlob The ZIP blob to download
 * @param fileName The filename for the downloaded file (should end with .zip)
 */
export function downloadZip(zipBlob: Blob, fileName: string): void {
  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}