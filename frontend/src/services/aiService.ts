import { VideoGenerationInput, GeneratedShort } from '../types';

export async function generateVideoShortStream(
  input: VideoGenerationInput,
  onLog: (line: string) => void,
  onComplete: (data: GeneratedShort) => void,
  onError: (err: string) => void
) {
  try {
    const response = await fetch('/api/generate-short-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        const line = part.trim();
        if (line.startsWith('data: ')) {
          try {
            const { type, payload } = JSON.parse(line.slice(6));
            if (type === 'log') {
              onLog(payload);
            } else if (type === 'complete') {
              onComplete(payload);
            } else if (type === 'error') {
              onError(payload);
            }
          } catch (e) {
            console.error('SSE parse error:', e);
          }
        }
      }
    }
  } catch (err: any) {
    console.error('Stream request failed:', err);
    onError(err.message || 'Network stream error');
  }
}
