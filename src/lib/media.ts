import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { ImageInput } from './coachShared';

// 1568 px is the largest edge Claude reads without downscaling. Kept at the
// maximum so the small print of nutrition labels stays legible (about 2,450
// tokens for a 4:3 photo, versus about 1,640 at 1280 px).
const MAX_EDGE = 1568;

/** Downscales a photo and returns it as base64 JPEG for the API. */
export async function fileToImage(file: File): Promise<ImageInput & { previewUrl: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  return { mediaType: 'image/jpeg', base64: dataUrl.split(',')[1], previewUrl: dataUrl };
}

marked.setOptions({ gfm: true, breaks: true });

export function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(marked.parse(text, { async: false }));
}
