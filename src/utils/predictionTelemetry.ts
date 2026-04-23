export type PredictionTelemetryKind = 'word' | 'sentence' | 'ghost' | 'starter';

export interface PredictionTelemetrySnapshot {
  charsSaved: number;
  wordAccepts: number;
  sentenceAccepts: number;
  ghostAccepts: number;
  starterAccepts: number;
  lastUpdatedAt: number;
}

export const PREDICTION_TELEMETRY_STORAGE_KEY = 'gazeconnect_prediction_telemetry_v1';
export const PREDICTION_TELEMETRY_EVENT = 'gazeconnect_prediction_telemetry';

export const DEFAULT_PREDICTION_TELEMETRY: PredictionTelemetrySnapshot = {
  charsSaved: 0,
  wordAccepts: 0,
  sentenceAccepts: 0,
  ghostAccepts: 0,
  starterAccepts: 0,
  lastUpdatedAt: 0,
};

export function loadPredictionTelemetry(): PredictionTelemetrySnapshot {
  if (typeof window === 'undefined') {
    return DEFAULT_PREDICTION_TELEMETRY;
  }

  try {
    const raw = window.localStorage.getItem(PREDICTION_TELEMETRY_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PREDICTION_TELEMETRY;
    }

    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PREDICTION_TELEMETRY,
      ...parsed,
    };
  } catch {
    return DEFAULT_PREDICTION_TELEMETRY;
  }
}

export function normalizeCharsSaved(charsSaved: number): number {
  if (!Number.isFinite(charsSaved)) {
    return 0;
  }
  return Math.max(0, Math.round(charsSaved));
}

export function applyPredictionTelemetry(
  previous: PredictionTelemetrySnapshot,
  kind: PredictionTelemetryKind,
  charsSaved: number,
): PredictionTelemetrySnapshot {
  const saved = normalizeCharsSaved(charsSaved);
  const next: PredictionTelemetrySnapshot = {
    ...previous,
    charsSaved: previous.charsSaved + saved,
    lastUpdatedAt: Date.now(),
  };

  if (kind === 'word') next.wordAccepts += 1;
  if (kind === 'sentence') next.sentenceAccepts += 1;
  if (kind === 'ghost') next.ghostAccepts += 1;
  if (kind === 'starter') next.starterAccepts += 1;

  return next;
}

export function persistPredictionTelemetry(snapshot: PredictionTelemetrySnapshot) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(PREDICTION_TELEMETRY_STORAGE_KEY, JSON.stringify(snapshot));
    window.dispatchEvent(new CustomEvent(PREDICTION_TELEMETRY_EVENT, {
      detail: snapshot,
    }));
  } catch {
    // Ignore storage restrictions in locked-down environments.
  }
}

export function resetPredictionTelemetry(): PredictionTelemetrySnapshot {
  const empty = {
    ...DEFAULT_PREDICTION_TELEMETRY,
    lastUpdatedAt: Date.now(),
  };
  persistPredictionTelemetry(empty);
  return empty;
}
