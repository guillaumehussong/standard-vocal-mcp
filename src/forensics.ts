/**
 * audio_forensics — downloads the 3 recording tracks of a call and runs RMS analysis.
 * Automates exactly the investigation we ran by hand: locate noise source (client/assistant/mono).
 */
import { vapiGet, vapiDownload } from "./vapi.js";
import { parseWav, trackStats, type TrackStats } from "./lib/audio.js";

export interface ForensicsReport {
  callId: string;
  verdict: string;
  customer: TrackStats;
  assistant: TrackStats;
  mono: TrackStats;
  interpretation: string;
}

export async function audioForensics(callId: string): Promise<ForensicsReport> {
  const [monoBuf, customerBuf, assistantBuf] = await Promise.all([
    vapiDownload(`/call/${callId}/mono-recording`),
    vapiDownload(`/call/${callId}/customer-recording`),
    vapiDownload(`/call/${callId}/assistant-recording`),
  ]);

  const customer = trackStats(parseWav(customerBuf));
  const assistant = trackStats(parseWav(assistantBuf));
  const mono = trackStats(parseWav(monoBuf));

  // Interpretation logic (mirrors our manual finding):
  // - customer floor ≈ 0 → noise is NOT on the caller's mic
  // - assistant floor >> 0 → TTS/elevenlabs or trunk adds noise floor
  const customerClean = customer.floor < 0.001 && customer.silentFrac > 0.5;
  const interpretation = customerClean
    ? "Piste client propre → le bruit est injecté APRÈS le micro de l'appelant (trunk Twilio, écho local, ou appareil d'écoute). Vérifier : test 10s de silence sans parler."
    : "Piste client bruitée → le bruit vient du micro/environnement de l'appelant.";

  return {
    callId,
    verdict: customerClean ? "noise_downstream_of_vapi" : "noise_on_caller_side",
    customer,
    assistant,
    mono,
    interpretation,
  };
}
