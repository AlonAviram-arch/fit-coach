import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { ImageInput } from './coachShared';

// ~1,600 tokens per photo on Claude instead of ~2,450 at 1568 px; labels stay legible.
const MAX_EDGE = 1280;

/** Downscales a photo and returns it as base64 JPEG for the API. */
export async function fileToImage(file: File): Promise<ImageInput & { previewUrl: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { mediaType: 'image/jpeg', base64: dataUrl.split(',')[1], previewUrl: dataUrl };
}

marked.setOptions({ gfm: true, breaks: true });

export function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(marked.parse(text, { async: false }));
}
