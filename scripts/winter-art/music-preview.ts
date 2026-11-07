/** Browser-only offline renderer for checking the actual sampled soundtrack. */
import { instrumentsOf, renderInto } from "../../src/client/shared/music/engine.ts";
import { loadSamples } from "../../src/client/shared/music/samples.ts";
import { TRACKS } from "../../src/client/shared/music/tracks.ts";
import type { MusicTrackId } from "../../src/shared/music-tracks.ts";

declare global {
  interface Window { renderChristmasMusic: (id: MusicTrackId, seconds: number, intensity: number) => Promise<{ wav: string; peak: number; rms: number }> }
}
window.renderChristmasMusic = async (id, seconds, intensity) => {
  const track = TRACKS[id];
  const ctx = new OfflineAudioContext(2, Math.ceil((seconds + 2) * 44100), 44100);
  await loadSamples(ctx, instrumentsOf(track));
  const gain = ctx.createGain(); gain.gain.value = .7; gain.connect(ctx.destination);
  renderInto(ctx, gain, track, seconds, intensity);
  const buffer = await ctx.startRendering();
  const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
  let peak = 0, sum = 0;
  for (const channel of [left, right]) for (const sample of channel) { peak = Math.max(peak, Math.abs(sample)); sum += sample * sample; }
  const wav = new ArrayBuffer(44 + left.length * 4), v = new DataView(wav);
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
  text(0, "RIFF"); v.setUint32(4, wav.byteLength - 8, true); text(8, "WAVEfmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, 44100, true); v.setUint32(28, 176400, true);
  v.setUint16(32, 4, true); v.setUint16(34, 16, true); text(36, "data"); v.setUint32(40, wav.byteLength - 44, true);
  // Preserve the mix; apply headroom only if the offline render would clip.
  const scale = Math.min(1, .9 / Math.max(.001, peak));
  for (let i = 0; i < left.length; i++) for (let c = 0; c < 2; c++) v.setInt16(44 + i * 4 + c * 2, Math.max(-32768, Math.min(32767, Math.round((c ? right[i]! : left[i]!) * scale * 32767))), true);
  const bytes = new Uint8Array(wav); let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return { wav: btoa(binary), peak, rms: Math.sqrt(sum / (left.length * 2)) };
};
