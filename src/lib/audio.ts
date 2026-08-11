/**
 * WAV parsing + RMS window analysis (ported from the forensic script we ran by hand).
 * Parses RIFF PCM16 mono WAV buffers; no external deps.
 */

export interface WavInfo {
  samples: Float32Array; // normalized -1..1
  rate: number;
}

export function parseWav(buf: Buffer): WavInfo {
  // minimal RIFF parser: find 'data' chunk
  if (buf.readUInt32BE(0) !== 0x52494646) throw new Error("not RIFF");
  let offset = 12;
  let rate = 16000;
  let bits = 16;
  let dataOffset = -1;
  let dataLen = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      rate = buf.readUInt32LE(offset + 12);
      bits = buf.readUInt16LE(offset + 22);
    } else if (id === "data") {
      dataOffset = offset + 8;
      dataLen = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (dataOffset < 0) throw new Error("no data chunk");
  if (bits !== 16) throw new Error(`unsupported bits: ${bits}`);
  const n = Math.floor(dataLen / 2);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = buf.readInt16LE(dataOffset + i * 2) / 32768;
  return { samples, rate };
}

/** RMS per window (ms). */
export function rmsWindows(info: WavInfo, winMs = 50): number[] {
  const win = Math.floor((info.rate * winMs) / 1000);
  const out: number[] = [];
  for (let i = 0; i + win <= info.samples.length; i += win) {
    let s = 0;
    for (let j = i; j < i + win; j++) s += info.samples[j] * info.samples[j];
    out.push(Math.sqrt(s / win));
  }
  return out;
}

export interface TrackStats {
  durationSec: number;
  peak: number;
  /** floor = 5th percentile RMS of windows (noise floor) */
  floor: number;
  p25: number;
  p50: number;
  p90: number;
  /** fraction of windows below 5% of peak (true silence) */
  silentFrac: number;
}

export function trackStats(info: WavInfo, winMs = 50): TrackStats {
  const rms = rmsWindows(info, winMs);
  const sorted = [...rms].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const peak = Math.max(...rms);
  const silent = rms.filter((r) => r < peak * 0.05).length / rms.length;
  return {
    durationSec: info.samples.length / info.rate,
    peak,
    floor: q(0.05),
    p25: q(0.25),
    p50: q(0.5),
    p90: q(0.9),
    silentFrac: silent,
  };
}
