// =============================================
// ttsRouting.ts — pure speech-routing decisions (v17.18)
// =============================================
// Extracted from App.tsx so the safety-critical routing rules are testable
// without React (scripts/check-tts-routing.js). The rules exist because the
// backend voice (pyttsx3/SAPI5) has no language switching and typically no
// Hindi voice: any Devanagari content must go through browser
// speechSynthesis — the only path that can select a hi-IN voice. Routing to
// exactly ONE path per utterance is what fixes the double-speak bug without
// sacrificing Hindi or emergency speech.

export type SpeechRoute = 'mute' | 'backend' | 'browser';

export const DEVANAGARI_RE = /[ऀ-ॿ]/;

export interface SpeechRouteInputs {
  text: string;
  /** Settings value: 'english' | 'hindi' | 'auto' (undefined = english). */
  ttsLanguage: string | undefined;
  /** Settings ttsVolume 0..1. <= 0 means mute EVERYTHING (incl. backend). */
  volume: number;
  backendConnected: boolean;
  /** tts_available from the backend 'connected' handshake. */
  backendTtsAvailable: boolean;
}

export function chooseSpeechRoute(inputs: SpeechRouteInputs): SpeechRoute {
  if (!inputs.text.trim()) return 'mute';
  if (inputs.volume <= 0) return 'mute';
  // Hindi-bearing utterances (or an explicit Hindi voice preference) must
  // use the browser engine regardless of backend health.
  if (inputs.ttsLanguage === 'hindi' || DEVANAGARI_RE.test(inputs.text)) {
    return 'browser';
  }
  return inputs.backendConnected && inputs.backendTtsAvailable ? 'backend' : 'browser';
}

/**
 * Settings store speech rate as WPM (80-250, AppSettingsPanel slider);
 * SpeechSynthesisUtterance.rate is a 0.1-10 multiplier around a ~150 WPM
 * baseline. Values below 40 are treated as an already-converted multiplier
 * (back-compat with speakText's default rate=1.0).
 */
export function browserRateFromWpm(rate: number): number {
  const multiplier = rate >= 40 ? rate / 150 : rate;
  return Math.max(0.1, Math.min(10, multiplier));
}

export interface SpeechSegment {
  text: string;
  lang: 'hi-IN' | 'en-US';
}

/**
 * Split a possibly-mixed utterance into Devanagari / non-Devanagari runs so
 * the bilingual emergency phrase gets a Hindi voice for the Hindi half and
 * an English voice for the English half. speechSynthesis.speak() queues, so
 * segments play in order. Whitespace/punctuation (incl. danda U+0964/0965)
 * following a Hindi run is absorbed into it.
 */
export function splitSpeechSegments(text: string): SpeechSegment[] {
  const runs = text.match(/[ऀ-ॿ][ऀ-ॿ\s.,!?।॥]*|[^ऀ-ॿ]+/g) || [text];
  const segments: SpeechSegment[] = [];
  for (const run of runs) {
    const trimmed = run.trim();
    if (!trimmed) continue;
    segments.push({ text: trimmed, lang: DEVANAGARI_RE.test(run) ? 'hi-IN' : 'en-US' });
  }
  return segments;
}
