import { VideoGenerationInput, GeneratedShort } from '../types';

export async function generateVideoShort(input: VideoGenerationInput): Promise<GeneratedShort> {
  const res = await fetch('/api/generate-short', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Server returned HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.success && json.data) {
    return json.data;
  }

  throw new Error(json.error || 'Unknown server error');
}
