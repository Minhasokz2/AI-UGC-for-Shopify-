import { useMutation } from '@tanstack/react-query';
import { apiPost } from '../lib/apiClient.js';

/**
 * Backs every "attach a new image" control. Accepts either a plain URL
 * string or a base64 data: URI (e.g. from FileReader.readAsDataURL on a
 * locally-chosen file).
 */
export function useUploadImage() {
  return useMutation({
    mutationFn: (image) => apiPost('/api/uploads', { image }),
  });
}

/**
 * Reads a File/Blob as a base64 data: URI, for handing to useUploadImage.
 */
export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
