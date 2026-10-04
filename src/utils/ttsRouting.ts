/** One local voice for all app speech. Never substitute an OS/browser voice. */
export type SpeechRoute = 'mute' | 'backend' | 'unavailable';
export interface SpeechRouteInputs {
  text: string;
  volume: number;
  backendConnected: boolean;
  backendVoice: string | null;
}
export function chooseSpeechRoute(inputs: SpeechRouteInputs): SpeechRoute {
  if (!inputs.text.trim() || !Number.isFinite(inputs.volume) || inputs.volume <= 0) return 'mute';
  // A starting/error worker still accepts an explicit retry; readiness is shown
  // separately. A legacy backend must not speak in a different voice.
  return inputs.backendConnected && inputs.backendVoice === 'af_heart' ? 'backend' : 'unavailable';
}
