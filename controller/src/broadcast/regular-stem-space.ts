/** Admission for optional regular-stem jobs, never a reservation or a cache
 * budget. Sum demands sharing a filesystem and leave 256 MiB for station work.
 * Only controller-visible shared volumes can be checked here; sidecar-private
 * scratch and concurrent writers still have normal job-failure fallback.
 */
import path from 'node:path';
import { stat, statfs } from 'node:fs/promises';

async function inspectVolume(directory: string): Promise<{ device: number; available: number }> {
  for (;;) {
    try {
      const info = await stat(directory);
      const space = await statfs(directory);
      return { device: info.dev, available: space.bavail * space.bsize };
    } catch (error) {
      const parent = path.dirname(directory);
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || parent === directory) throw error;
      directory = parent;
    }
  }
}

export async function requireRegularStemSpace(
  requests: readonly { directory: string; bytes: number }[],
  inspect = inspectVolume,
): Promise<void> {
  const volumes = new Map<number, { available: number; required: number }>();
  for (const request of requests) {
    if (!Number.isSafeInteger(request.bytes) || request.bytes < 0) throw new Error('Invalid regular stems space estimate');
    const space = await inspect(path.resolve(request.directory));
    if (!Number.isFinite(space.available) || space.available < 0) throw new Error('Regular stems free space unavailable');
    const volume = volumes.get(space.device) ?? { available: space.available, required: 256 * 1024 * 1024 };
    volume.available = Math.min(volume.available, space.available);
    volume.required += request.bytes;
    volumes.set(space.device, volume);
  }
  for (const volume of volumes.values()) {
    if (volume.available < volume.required) throw new Error('Insufficient free space for regular stems; using ordinary transition');
  }
}

// Four lossless stems plus decoded/intermediate copies and small peak files.
// A conservative float64 stereo allowance avoids assuming FLAC compression.
export function regularStemWindowBytes(startMs: number, endMs: number): number {
  const seconds = (endMs-startMs)/1000;
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 120) throw new Error('Invalid regular stems window length');
  return Math.ceil(seconds * 44100 * 2 * 8 * 8) + 1024 * 1024;
}
