/**
 * FloorPlanSurveyScreen — GazePlan Pro Survey Interface (V8)
 *
 * 3-Row Layout:
 *   ROW 1: GlobalNavBar
 *   ROW 2: Horizontal phase tabs + inline progress bar
 *   ROW 3: Left question text (22%) | Right action bar + options (78%)
 *
 * Action bar: ← BACK | ✓ CONFIRM (multi) | SKIP → | ··· | 👁 GAZE
 * Options: Adaptive grid (2/3/4 cols), scrollable if overflow
 * sessionStorage + WebSocket auto-save
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import GazeButton from '../components/core/GazeButton';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useGazeControl } from '../components/core/GazeControlToggle';
import { useWS } from '../hooks/useWebSocket';
import { SURVEY_QUESTIONS, SURVEY_PHASES_V2 } from '../data/surveyQuestions';
import { SurveyQuestion, PhaseStatus } from '../types/SurveyTypes';
import { screenThemes, typography, lightColors } from '../utils/design';
import { computeCompleteness, formatNotepadSummary } from '../utils/surveyDefaults';
import { FloorPlanViewerModal } from '../components/FloorPlanViewerModal';
import { enrichWithSurveyData, CompassMapPayload } from '../utils/floorplanApi';
import { useTheme } from '../contexts/ThemeContext';

// ─── Theme ──────────────────────────────────────────────────

const THEME = {
    ...screenThemes.floorPlan,
    bg: screenThemes.floorPlan.bg,
    panelBg: screenThemes.floorPlan.panelBg,
    cardBg: screenThemes.floorPlan.cardBg,
    border: screenThemes.floorPlan.border,
    accent: screenThemes.floorPlan.accentStrong,
    accentHover: screenThemes.floorPlan.accent,
    success: screenThemes.floorPlan.success,
    successSubtle: screenThemes.floorPlan.successSubtle,
    warning: screenThemes.floorPlan.warning,
    warningSubtle: screenThemes.floorPlan.warningSubtle,
    danger: screenThemes.floorPlan.danger,
    textMain: screenThemes.floorPlan.textMain,
    textSub: screenThemes.floorPlan.textSub,
    textDim: screenThemes.floorPlan.textDim,
    phaseComplete: screenThemes.floorPlan.textMain,
    phaseCurrent: screenThemes.floorPlan.accentStrong,
    phasePending: 'rgba(42, 61, 82, 0.56)',
};

const UI_FONT = typography.fontFamily.primary;

const AUTO_SAVE_INTERVAL = 30000;
const STORAGE_KEY = 'gazeconnect_survey_progress';

function clampQuestionIndex(index: number, totalQuestions: number): number {
    if (!Number.isFinite(index)) return 0;
    if (totalQuestions <= 0) return 0;
    return Math.max(0, Math.min(index, totalQuestions - 1));
}

// ─── Helper: Get options for a question ─────────────────────

function getQuestionOptions(q: SurveyQuestion, answers: Record<string, any>): string[] {
    if (q.dynamicOptions) return q.dynamicOptions(answers);
    return q.options || [];
}

// ─── Adaptive grid basis helper ─────────────────────────────

function getGridBasis(count: number): string {
    if (count <= 4) return '44%';
    if (count <= 6) return '31%';
    if (count <= 9) return '31%';
    return '23%';
}

// ─── SummaryPanel (for Summary Modal) — Beautiful, well-formatted ────

const SummaryPanel = ({
    answers, questions, currentPhase, isLight = false,
}: {
    answers: Record<string, any>; questions: SurveyQuestion[]; currentPhase: string; isLight?: boolean;
}) => {
    const completeness = useMemo(() => computeCompleteness(answers, questions), [answers, questions]);
    const answeredCount = Object.keys(answers).filter(k => answers[k] !== undefined && answers[k] !== 'SKIPPED').length;
    const skippedCount = Object.values(answers).filter(v => v === 'SKIPPED').length;

    // Theme tokens — fall back to dark THEME when light mode is off
    const tMain = isLight ? lightColors.text.primary : THEME.textMain;
    const tSub = isLight ? lightColors.text.secondary : THEME.textSub;
    const tDim = isLight ? lightColors.text.tertiary : THEME.textDim;
    const tAccent = isLight ? '#1F6B7E' : THEME.accent;
    const tWarn = isLight ? lightColors.warning.main : THEME.warning;
    const tBarTrack = isLight ? 'rgba(82, 66, 45, 0.12)' : 'rgba(255,255,255,0.08)';
    const tDivider = isLight ? lightColors.border.light : 'rgba(100,116,139,0.12)';
    const tCardBg = isLight ? 'rgba(82, 66, 45, 0.05)' : 'rgba(255,255,255,0.03)';
    const tSkippedBg = isLight ? 'rgba(168, 120, 56, 0.10)' : 'rgba(245, 158, 11, 0.06)';

    // Group answers by phase
    const phaseGroups = useMemo(() => {
        const groups: { phase: string; items: { question: string; answer: string; skipped: boolean }[] }[] = [];
        const seen = new Set<string>();
        for (const q of questions) {
            if (!seen.has(q.phase)) { seen.add(q.phase); groups.push({ phase: q.phase, items: [] }); }
            const key = q.dataKey || q.id;
            const val = answers[key];
            if (val !== undefined) {
                const isSkipped = val === 'SKIPPED';
                const display = Array.isArray(val) ? val.join(', ') : String(val);
                const group = groups.find(g => g.phase === q.phase)!;
                group.items.push({ question: q.text, answer: display, skipped: isSkipped });
            }
        }
        return groups.filter(g => g.items.length > 0);
    }, [answers, questions]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header stats */}
            <div style={{ padding: 'clamp(16px, 2vh, 24px) clamp(20px, 2.5vw, 32px)', borderBottom: `1px solid ${tDivider}`, flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: 'clamp(14px, 1.8vh, 18px)', color: tMain, fontWeight: 700 }}>
                        Overall Progress
                    </span>
                    <span style={{ fontSize: 'clamp(18px, 2.2vh, 24px)', color: tAccent, fontWeight: 700 }}>
                        {completeness.percentage}%
                    </span>
                </div>
                <div style={{ width: '100%', height: '6px', background: tBarTrack, borderRadius: '3px', overflow: 'hidden', marginBottom: '12px' }}>
                    <div style={{ width: `${completeness.percentage}%`, height: '100%', background: tAccent, borderRadius: '3px', transition: 'width 0.3s ease' }} />
                </div>
                <div style={{ display: 'flex', gap: 'clamp(16px, 2vw, 32px)' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 'clamp(20px, 2.5vh, 28px)', fontWeight: 700, color: tAccent }}>{answeredCount}</div>
                        <div style={{ fontSize: 'clamp(11px, 1.3vh, 14px)', color: tSub, fontWeight: 600 }}>Answered</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 'clamp(20px, 2.5vh, 28px)', fontWeight: 700, color: tWarn }}>{skippedCount}</div>
                        <div style={{ fontSize: 'clamp(11px, 1.3vh, 14px)', color: tSub, fontWeight: 600 }}>Skipped</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 'clamp(20px, 2.5vh, 28px)', fontWeight: 700, color: tSub }}>{completeness.total - answeredCount - skippedCount}</div>
                        <div style={{ fontSize: 'clamp(11px, 1.3vh, 14px)', color: tSub, fontWeight: 600 }}>Remaining</div>
                    </div>
                </div>
            </div>
            {/* Per-phase answers */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 'clamp(12px, 1.5vh, 20px) clamp(20px, 2.5vw, 32px)' }}>
                {phaseGroups.length === 0 ? (
                    <div style={{ color: tDim, fontStyle: 'italic', padding: '40px 0', textAlign: 'center', fontSize: 'clamp(15px, 1.8vh, 19px)' }}>
                        No answers recorded yet. Start answering questions to see your summary here.
                    </div>
                ) : (
                    phaseGroups.map(group => (
                        <div key={group.phase} style={{ marginBottom: 'clamp(16px, 2vh, 28px)' }}>
                            <div style={{
                                color: group.phase === currentPhase ? tAccent : tMain,
                                fontSize: 'clamp(16px, 2vh, 22px)',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '1.5px',
                                marginBottom: 'clamp(8px, 1vh, 14px)',
                                paddingBottom: '8px',
                                borderBottom: `2px solid ${group.phase === currentPhase ? (isLight ? 'rgba(31, 107, 126, 0.42)' : THEME.accent + '40') : tDivider}`,
                            }}>
                                {group.phase}
                                <span style={{ fontSize: 'clamp(12px, 1.3vh, 14px)', color: tSub, fontWeight: 500, marginLeft: '10px', textTransform: 'none', letterSpacing: '0' }}>
                                    ({group.items.length} {group.items.length === 1 ? 'answer' : 'answers'})
                                </span>
                            </div>
                            {group.items.map((item, i) => (
                                <div key={i} style={{
                                    marginBottom: 'clamp(8px, 1vh, 14px)',
                                    padding: 'clamp(8px, 1vh, 14px) clamp(10px, 1.2vw, 16px)',
                                    background: item.skipped ? tSkippedBg : tCardBg,
                                    borderRadius: '10px',
                                    borderLeft: `3px solid ${item.skipped ? tWarn : tAccent}`,
                                }}>
                                    <div style={{ color: tSub, fontSize: 'clamp(12px, 1.4vh, 15px)', marginBottom: '4px', lineHeight: 1.3 }}>
                                        {item.question}
                                    </div>
                                    <div style={{
                                        color: item.skipped ? tWarn : tMain,
                                        fontSize: 'clamp(15px, 1.8vh, 20px)',
                                        fontWeight: 600,
                                        fontStyle: item.skipped ? 'italic' : 'normal',
                                    }}>
                                        {item.skipped ? 'Skipped' : item.answer}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

// ─── SaveConfirmModal ───────────────────────────────────────

const SaveConfirmModal = ({ mode, onClose, isLight = false }: { mode: 'generate' | 'save'; onClose: () => void; isLight?: boolean }) => {
    const tBg = isLight ? lightColors.background.elevated : THEME.panelBg;
    const tBorder = isLight ? lightColors.border.main : THEME.border;
    const tMain = isLight ? lightColors.text.primary : THEME.textMain;
    const tSub = isLight ? lightColors.text.secondary : THEME.textSub;
    const tAccent = isLight ? '#1F6B7E' : THEME.accent;
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isLight ? 'rgba(74, 58, 42, 0.55)' : 'rgba(0,0,0,0.78)',
        }}>
            <div style={{
                background: tBg, border: `1px solid ${tBorder}`,
                borderRadius: '20px', padding: 'clamp(24px, 4vh, 48px)', maxWidth: '480px', width: '90%',
                textAlign: 'center', boxShadow: isLight ? '0 12px 28px rgba(82, 66, 45, 0.20)' : '0 8px 24px rgba(0,0,0,0.24)',
                fontFamily: UI_FONT,
            }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                    {mode === 'generate' ? '\u2705' : '\u{1F4BE}'}
                </div>
                <h2 style={{ color: tMain, fontSize: 'clamp(18px, 2.5vh, 28px)', marginBottom: '12px', fontWeight: 700 }}>
                    {mode === 'generate' ? 'Plan Generated!' : 'Progress Saved'}
                </h2>
                <p style={{ color: tSub, fontSize: 'clamp(13px, 1.6vh, 17px)', lineHeight: 1.5, marginBottom: '24px' }}>
                    {mode === 'generate'
                        ? 'Files saved to survey_data folder. You can review and refine these with your architect or caregiver.'
                        : 'Your progress has been saved. You can resume anytime from Design Home.'}
                </p>
                <GazeButton id="modal-ok" onClick={onClose} gazeEnabled={true} alwaysActive={true} gazeEnabledTimestamp={0} isDarkMode={!isLight}
                    dwellCategory="navigationButton"
                    style={{ padding: 'clamp(12px, 1.8vh, 20px) clamp(32px, 5vw, 64px)', background: tAccent, color: '#FFF', borderRadius: '12px', fontSize: 'clamp(14px, 1.8vh, 20px)', fontWeight: 700, border: 'none' }}>
                    OK {mode === 'generate' ? '\u2014 Return to Home' : ''}
                </GazeButton>
            </div>
        </div>
    );
};

// ─── Main Screen Component ─────────────────────────────────

function FloorPlanSurveyScreen({ onNavigate, onSpeak, isGazeEnabled: globalGazeEnabled }: any) {
    const [answers, setAnswers] = useState<Record<string, any>>({});
    const [qIndex, setQIndex] = useState(0);
    const [sessionLoaded, setSessionLoaded] = useState(false);
    const [isDarkMode] = useState(true);
    const [showModal, setShowModal] = useState<'generate' | 'save' | null>(null);
    const [showSummary, setShowSummary] = useState(false);
    const [showFloorPlanViewer, setShowFloorPlanViewer] = useState(false);

    const { isGazeEnabled } = useGazeControl();
    const { isLight, isWarm } = useTheme();

    // Theme-aware text + accent tokens. THEME.* is dark-only (light text, dark
    // bg). When isLight=true, override text colors to dark warm-brown so they
    // read clearly on the cream surface. Accent stays cyan but switches to a
    // deeper variant for adequate contrast on light bg.
    const T_textMain = isLight ? lightColors.text.primary : THEME.textMain;
    const T_textSub = isLight ? lightColors.text.secondary : THEME.textSub;
    const T_textDim = isLight ? lightColors.text.tertiary : THEME.textDim;
    const T_accent = isLight ? '#1F6B7E' : THEME.accent;            // deeper teal for light bg
    const T_accentSoft = isLight ? 'rgba(31, 107, 126, 0.12)' : 'rgba(100, 181, 246, 0.08)';
    const T_accentBorder = isLight ? 'rgba(31, 107, 126, 0.42)' : `${THEME.accent}40`;
    const T_warning = isLight ? lightColors.warning.main : THEME.warning;     // antique amber on light
    const T_warningSoft = isLight ? 'rgba(168, 120, 56, 0.10)' : 'rgba(245, 158, 11, 0.06)';
    const T_warningBorder = isLight ? 'rgba(168, 120, 56, 0.36)' : 'rgba(245, 158, 11, 0.25)';
    const T_optionBg = isLight ? lightColors.background.elevated : THEME.panelBg;
    const T_optionBorder = isLight ? `1.5px solid ${lightColors.border.main}` : '1px solid rgba(100, 116, 139, 0.2)';
    const { saveSurvey, compileSurvey, snapshotSurvey, surveyData } = useWS();
    const scrollViewRef = useRef<HTMLDivElement>(null);
    const snapshotSurveyRef = useRef(snapshotSurvey);
    const autosavePayloadRef = useRef<{ answers: Record<string, any>; qIndex: number; phase: string }>({
        answers: {},
        qIndex: 0,
        phase: '',
    });

    useEffect(() => {
        snapshotSurveyRef.current = snapshotSurvey;
    }, [snapshotSurvey]);

    // v17: Survey-only gaze model — gaze stays bound to the global NavBar toggle.
    //   On each new question, we bump `surveyGazeTimestamp = Date.now()` which
    //   trips the GazeButton's built-in 1.5s cooldown (GAZE_ENABLE_COOLDOWN_MS) —
    //   options become inert for ~1.5s while the user reads the question, then
    //   activate automatically with no extra click required.
    //   Combined with `dwellCategory="surveyOption"` (1300ms dwell) on option
    //   buttons, this gives a strong margin against accidental selections without
    //   the friction of a per-question "ready" gate.
    //   BACK / VIEW SUMMARY / SKIP / Emergency keep their standard fast dwell.
    const [surveyGazeTimestamp, setSurveyGazeTimestamp] = useState(0);

    // Bump timestamp on every question change → triggers settling cooldown for options
    useEffect(() => {
        setSurveyGazeTimestamp(Date.now());
    }, [qIndex]);

    // Effective gaze state mirrors the global NavBar toggle directly
    const effectiveGazeActive = isGazeEnabled;
    const effectiveGazeTimestamp = surveyGazeTimestamp;
    // Nav-bar buttons (BACK / SKIP / VIEW SUMMARY) bypass the per-question
    // settling cooldown — escape paths must always be reachable instantly.
    const navGazeTimestamp = 0;

    // ── Session Resume: localStorage first (instant), then WebSocket ──
    useEffect(() => {
        try {
            const saved = sessionStorage.getItem(STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                if (data.answers && Object.keys(data.answers).length > 0) {
                    const restoredAnswers = data.answers as Record<string, any>;
                    const restoredQuestions = SURVEY_QUESTIONS.filter(
                        q => !q.condition || q.condition(restoredAnswers),
                    );
                    const restoredIndex = clampQuestionIndex(
                        Number.isInteger(data.qIndex) ? data.qIndex : 0,
                        restoredQuestions.length,
                    );
                    setAnswers(restoredAnswers);
                    setQIndex(restoredIndex);
                    setSessionLoaded(true);
                }
            }
        } catch (e) { /* ignore parse errors */ }
        
    }, []);

    useEffect(() => {
        if (surveyData && !sessionLoaded) {
            if (surveyData.answers && Object.keys(surveyData.answers).length > 0) {
                const restoredAnswers = surveyData.answers as Record<string, any>;
                const restoredQuestions = SURVEY_QUESTIONS.filter(
                    q => !q.condition || q.condition(restoredAnswers),
                );
                const restoredIndex = clampQuestionIndex(
                    typeof surveyData.qIndex === 'number' ? surveyData.qIndex : 0,
                    restoredQuestions.length,
                );
                setAnswers(restoredAnswers);
                setQIndex(restoredIndex);
            }
            setSessionLoaded(true);
        }
    }, [surveyData, sessionLoaded]);

    // ── Active questions (filtered by conditions) ──
    const activeQuestions = useMemo(() => SURVEY_QUESTIONS.filter(q => !q.condition || q.condition(answers)), [answers]);

    useEffect(() => {
        autosavePayloadRef.current = {
            answers,
            qIndex,
            phase: activeQuestions[qIndex]?.phase || '',
        };
    }, [answers, qIndex, activeQuestions]);

    // ── Auto-save to localStorage on EVERY answer (real-time sync) ──
    useEffect(() => {
        if (Object.keys(answers).length > 0) {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
                answers, qIndex,
                phase: activeQuestions[qIndex]?.phase || '',
                timestamp: new Date().toISOString(),
            }));
        }
    }, [answers, qIndex, activeQuestions]);

    // ── Auto-save to backend every 30s ──
    useEffect(() => {
        const interval = setInterval(() => {
            const payload = autosavePayloadRef.current;
            if (Object.keys(payload.answers).length === 0) return;
            snapshotSurveyRef.current({ ...payload, source: 'survey-autosave' });
        }, AUTO_SAVE_INTERVAL);
        return () => clearInterval(interval);
    }, []);

    const currentQ = activeQuestions[qIndex];
    const isLast = qIndex === activeQuestions.length - 1;

    // ── Unique Phases (derived from questions, not SURVEY_PHASES_V2) ──
    const UNIQUE_PHASES = useMemo(() => {
        const seen = new Set<string>();
        const phases: string[] = [];
        SURVEY_QUESTIONS.forEach(q => {
            if (!seen.has(q.phase)) {
                seen.add(q.phase);
                phases.push(q.phase);
            }
        });
        return phases;
    }, []);

    // ── Phase Status ──
    const currentPhaseId = currentQ?.phase || SURVEY_PHASES_V2[0].id;
    const phaseStatuses = useMemo((): Record<string, PhaseStatus> => {
        const statuses: Record<string, PhaseStatus> = {};
        const completeness = computeCompleteness(answers, SURVEY_QUESTIONS);
        let foundCurrent = false;
        for (const phase of SURVEY_PHASES_V2) {
            const data = completeness.byPhase[phase.id];
            if (phase.id === currentPhaseId) {
                statuses[phase.id] = 'current';
                foundCurrent = true;
            } else if (!foundCurrent) {
                statuses[phase.id] = 'complete';
            } else {
                const hasActiveQs = activeQuestions.some(q => q.phase === phase.id);
                if (!hasActiveQs) {
                    statuses[phase.id] = 'skipped';
                } else if (data && data.answered > 0) {
                    statuses[phase.id] = 'current';
                } else {
                    const prevIdx = SURVEY_PHASES_V2.indexOf(phase) - 1;
                    const prevStatus = prevIdx >= 0 ? statuses[SURVEY_PHASES_V2[prevIdx].id] : 'complete';
                    statuses[phase.id] = prevStatus === 'locked' ? 'locked' : 'current';
                }
            }
        }
        return statuses;
    }, [answers, currentPhaseId, activeQuestions]);

    // Safety guard
    if (!currentQ) {
        if (activeQuestions.length > 0 && qIndex >= activeQuestions.length) {
            setQIndex(activeQuestions.length - 1);
        }
        return <div style={{ color: T_textMain, padding: 40, background: isLight ? lightColors.background.primary : THEME.bg }}>Loading Question...</div>;
    }

    // ── Derived: current phase index, options, grid basis ──
    const currentPhaseIndex = UNIQUE_PHASES.indexOf(currentQ.phase);
    const currentOptions = getQuestionOptions(currentQ, answers);
    const gridBasis = getGridBasis(currentOptions.length);

    // ── Handlers ──
    // qIndex change triggers the settling-cooldown effect automatically — no
    // manual gaze lock needed.
    const advanceQuestion = () => {
        if (isLast) return;
        setQIndex(prev => prev + 1);
    };

    const handleAnswer = (ans: any) => {
        if (!currentQ) return;
        const key = currentQ.dataKey || currentQ.id;

        if (key === 'submit_action') {
            const newAnswers = { ...answers, [key]: ans };
            setAnswers(newAnswers);
            saveSurvey(newAnswers);
            if (ans === 'GENERATE PLAN') {
                compileSurvey({ answers: newAnswers });
                onSpeak('Plan generated successfully. Files saved.');
                setShowModal('generate');
            } else {
                saveSurvey(newAnswers);
                onSpeak('Progress saved.');
                setShowModal('save');
            }
            return;
        }

        const newAnswers = { ...answers, [key]: ans };
        setAnswers(newAnswers);
        saveSurvey(newAnswers);
        onSpeak(`Selected ${ans}`);
        if (isLast) {
            onSpeak('Survey Complete.');
            compileSurvey({ answers: newAnswers });
        } else {
            setTimeout(() => advanceQuestion(), 400);
        }
    };

    const handleMultiToggle = (opt: string) => {
        const key = currentQ.dataKey || currentQ.id;
        const current = (answers[key] as string[]) || [];
        const newSelection = current.includes(opt) ? current.filter((x: string) => x !== opt) : [...current, opt];
        setAnswers({ ...answers, [key]: newSelection });
    };

    const handleSkip = () => {
        setAnswers(prev => ({ ...prev, [currentQ.dataKey || currentQ.id]: 'SKIPPED' }));
        if (!isLast) advanceQuestion();
    };

    const handleModalClose = () => {
        setShowModal(null);
        onNavigate('home');
    };

    const handleBack = () => {
        setQIndex(prev => Math.max(0, prev - 1));
    };

    // ── Jump to first question of a clicked phase ──
    const handlePhaseClick = (phase: string) => {
        const firstIdx = activeQuestions.findIndex(q => q.phase === phase);
        if (firstIdx >= 0) {
            setQIndex(firstIdx);
            if (scrollViewRef.current) scrollViewRef.current.scrollTop = 0;
        }
    };

    // ── Save progress to backend ──
    const handleSaveProgress = () => {
        const phase = activeQuestions[qIndex]?.phase || '';
        saveSurvey({ answers, qIndex, phase, source: 'survey-manual' });
        snapshotSurvey({ answers, qIndex, phase, source: 'survey-manual' });
        onSpeak('Progress saved.');
    };

    const handleGenerateFromSurvey = () => {
        const existing = surveyData?.compass_map;
        if (existing && existing.ground_floor?.placements?.length > 0) {
            setShowFloorPlanViewer(true);
            onSpeak('Generating floor plan from compass map data...');
            return;
        }

        onSpeak('No compass map data found. Please complete Compass Map first for a detailed plan.');
    };

    // ════════════════════════════════════════════════════════════
    // RENDER
    // ════════════════════════════════════════════════════════════

    return (
        <div className={`survey-screen${isLight ? ' theme-light' : isWarm ? ' theme-warm' : ''}`} style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            backgroundColor: isLight ? lightColors.background.primary : isWarm ? '#F5EEDF' : THEME.bg,
            color: T_textMain,
            overflow: 'hidden',
            fontFamily: UI_FONT,
        }}>

            {/* ═══ ROW 1: Global Nav Bar ═══ */}
            <GlobalNavBar
                currentPage="floor-plan"
                onNavigate={onNavigate}
                onSpeak={onSpeak}
                isDarkMode={isDarkMode}
            />

            {/* ═══ ROW 2: Phase Tabs + Progress (HORIZONTAL, CLICKABLE) ═══ */}
            <div style={{
                flexShrink: 0,
                borderBottom: `1px solid ${isLight ? lightColors.border.light : 'rgba(148, 163, 184, 0.12)'}`,
                background: isLight ? lightColors.background.elevated : 'rgba(0, 0, 0, 0.15)',
                padding: 'clamp(6px, 0.8vh, 10px) clamp(8px, 1vw, 16px)',
            }}>
                {/* Phase Tabs — comfortable margins, stacked multi-word labels */}
                <div style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    justifyContent: 'stretch',
                    gap: 0,
                    width: '100%',
                    margin: 0,
                    padding: '0 clamp(8px, 1.2vw, 18px)',
                }}>
                    {UNIQUE_PHASES.map((phase, i) => {
                        const isCurrent = phase === currentQ.phase;
                        const isPast = i < currentPhaseIndex;
                        const isLastTab = i === UNIQUE_PHASES.length - 1;
                        const tabDividerColor = isLight
                            ? 'rgba(82, 66, 45, 0.18)'
                            : 'rgba(148, 163, 184, 0.18)';
                        // Split multi-word labels into stacked lines
                        const words = phase.split(' ');
                        const isMultiWord = words.length > 1;
                        return (
                            <GazeButton
                                key={phase}
                                id={`phase-tab-${phase}`}
                                onClick={() => handlePhaseClick(phase)}
                                gazeEnabled={effectiveGazeActive}
                                gazeEnabledTimestamp={navGazeTimestamp}
                                isDarkMode={isDarkMode}
                                dwellCategory="navigationButton"
                                style={{
                                    flex: '1 1 0',
                                    minWidth: 0,
                                    padding: isMultiWord
                                        ? 'clamp(8px, 1vh, 14px) clamp(8px, 1vw, 16px)'
                                        : 'clamp(14px, 1.8vh, 22px) clamp(8px, 1vw, 16px)',
                                    fontSize: 'clamp(15px, 1.7vh, 19px)',
                                    fontWeight: 700,
                                    fontFamily: UI_FONT,
                                    color: isCurrent ? T_accent : T_textMain,
                                    background: isCurrent ? T_accentSoft : 'transparent',
                                    border: 'none',
                                    borderRight: isLastTab ? 'none' : `1px solid ${tabDividerColor}`,
                                    borderRadius: '6px 6px 0 0',
                                    borderBottom: isCurrent ? `3px solid ${T_accent}` : '3px solid transparent',
                                    whiteSpace: isMultiWord ? 'normal' : 'nowrap',
                                    textAlign: 'center' as const,
                                    lineHeight: isMultiWord ? 1.15 : 1,
                                    letterSpacing: '0.3px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: 'none',
                                    opacity: isPast ? 0.75 : 1,
                                }}
                            >
                                {isPast ? '\u2713 ' : ''}{isMultiWord ? (
                                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        {words.map((w, wi) => <span key={wi}>{w}</span>)}
                                    </span>
                                ) : phase}
                            </GazeButton>
                        );
                    })}
                </div>

                {/* Progress Bar */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'clamp(8px, 1vw, 14px)',
                    padding: 'clamp(6px, 0.7vh, 10px) clamp(12px, 1.5vw, 24px) clamp(2px, 0.3vh, 4px)',
                }}>
                    <span style={{
                        fontSize: 'clamp(13px, 1.6vh, 17px)',
                        color: T_textSub,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                    }}>
                        {qIndex + 1} / {activeQuestions.length}
                    </span>
                    <div style={{
                        flex: 1,
                        height: '5px',
                        background: isLight ? 'rgba(82, 66, 45, 0.12)' : 'rgba(255,255,255,0.08)',
                        borderRadius: '3px',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            width: `${((qIndex + 1) / activeQuestions.length) * 100}%`,
                            height: '100%',
                            background: T_accent,
                            borderRadius: '3px',
                            transition: 'width 0.3s ease',
                        }} />
                    </div>
                </div>
            </div>

            {/* ═══ ROW 3: Two-Column Content ═══ */}
            <div style={{
                flex: 1,
                display: 'flex',
                overflow: 'hidden',
            }}>

                {/* ─── LEFT: Question Text (24%) ─── */}
                <div style={{
                    width: 'clamp(220px, 24%, 380px)',
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    padding: 'clamp(18px, 3vh, 36px) clamp(16px, 1.8vw, 28px) clamp(140px, 18vh, 200px)',
                    borderRight: `1px solid ${isLight ? lightColors.border.light : 'rgba(148, 163, 184, 0.12)'}`,
                    overflowY: 'auto',
                }}>
                    {/* Phase Label */}
                    <div style={{
                        fontSize: 'clamp(18px, 2.3vh, 25px)',
                        fontWeight: 800,
                        color: T_accent,
                        textTransform: 'uppercase',
                        letterSpacing: '1.5px',
                        marginBottom: 'clamp(10px, 1.5vh, 18px)',
                    }}>
                        {currentQ.phase}
                    </div>

                    {/* Question Title */}
                    <div style={{
                        fontSize: 'clamp(24px, 3.4vh, 36px)',
                        fontWeight: 700,
                        lineHeight: 1.35,
                        marginBottom: 'clamp(12px, 1.8vh, 22px)',
                        color: T_textMain,
                    }}>
                        {currentQ.text}
                    </div>

                    {/* Subtext */}
                    {currentQ.subtext && (
                        <div style={{
                            fontSize: 'clamp(17px, 2.1vh, 23px)',
                            color: T_textSub,
                            lineHeight: 1.5,
                        }}>
                            {currentQ.subtext}
                        </div>
                    )}

                    {/* Help Text */}
                    {currentQ.helpText && (
                        <div style={{
                            fontSize: 'clamp(16px, 1.9vh, 21px)',
                            color: T_warning,
                            lineHeight: 1.45,
                            fontStyle: 'italic',
                            marginTop: 'clamp(8px, 1.2vh, 16px)',
                        }}>
                            {currentQ.helpText}
                        </div>
                    )}

                    {/* Multi-select hint */}
                    {currentQ.type === 'multi' && (
                        <div style={{
                            marginTop: 'clamp(10px, 1.5vh, 20px)',
                            fontSize: 'clamp(16px, 1.9vh, 21px)',
                            color: T_warning,
                            fontStyle: 'italic',
                            lineHeight: 1.45,
                        }}>
                            Select all that apply, then press CONFIRM at the bottom.
                        </div>
                    )}
                </div>

                {/* ─── RIGHT: Options (top) + Action Bar (bottom) ─── */}
                <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}>

                    {/* OPTIONS AREA — Scrollable, bottom-padded to clear the fixed Command Bar */}
                    <div
                        ref={scrollViewRef}
                        style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: 'clamp(16px, 2.2vh, 28px) clamp(18px, 2.2vw, 30px)',
                            paddingBottom: 'clamp(220px, 28vh, 320px)',
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        {/* Options Grid */}
                        <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 'clamp(14px, 1.8vh, 24px)',
                            justifyContent: currentOptions.length <= 4 ? 'center' : 'flex-start',
                            alignContent: 'flex-start',
                        }}>

                            {/* ── GRID / COORDINATE-INPUT ── */}
                            {(currentQ.type === 'grid' || currentQ.type === 'coordinate-input') &&
                                currentOptions.map((opt: string) => {
                                    const isFewCards = currentOptions.length <= 4;
                                    return (
                                    <GazeButton
                                        key={opt}
                                        id={`opt-${opt}`}
                                        onClick={() => handleAnswer(opt)}
                                        gazeEnabled={effectiveGazeActive}
                                        gazeEnabledTimestamp={effectiveGazeTimestamp}
                                        dwellCategory="surveyOption"
                                        isDarkMode={isDarkMode}
                                        style={{
                                            padding: 'clamp(28px, 4vh, 48px) clamp(20px, 2.2vw, 32px)',
                                            fontSize: 'clamp(24px, 3.1vh, 34px)',
                                            fontWeight: 700,
                                            background: T_optionBg,
                                            border: T_optionBorder,
                                            borderRadius: '18px',
                                            color: T_textMain,
                                            flex: `0 1 ${gridBasis}`,
                                            maxWidth: gridBasis,
                                            minHeight: isFewCards
                                                ? 'clamp(140px, 19vh, 200px)'
                                                : 'clamp(86px, 12vh, 132px)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            textAlign: 'center' as const,
                                            boxShadow: isLight ? '0 4px 12px rgba(82, 66, 45, 0.08)' : 'none',
                                        }}
                                    >
                                        {opt}
                                    </GazeButton>
                                    );
                                })
                            }

                            {/* ── MULTI-SELECT ── */}
                            {currentQ.type === 'multi' &&
                                currentOptions.map((opt: string) => {
                                    const key = currentQ.dataKey || currentQ.id;
                                    const selected = ((answers[key] as string[]) || []).includes(opt);
                                    return (
                                        <GazeButton
                                            key={opt}
                                            id={`multi-${opt}`}
                                            onClick={() => handleMultiToggle(opt)}
                                            gazeEnabled={effectiveGazeActive}
                                            gazeEnabledTimestamp={effectiveGazeTimestamp}
                                            dwellCategory="surveyOption"
                                            isDarkMode={isDarkMode}
                                            style={{
                                                padding: 'clamp(22px, 3vh, 36px) clamp(20px, 2.2vw, 32px)',
                                                fontSize: 'clamp(24px, 3.1vh, 34px)',
                                                fontWeight: 700,
                                                background: selected ? T_accentSoft : T_optionBg,
                                                border: selected
                                                    ? `2px solid ${T_accent}`
                                                    : T_optionBorder,
                                                borderRadius: '16px',
                                                color: T_textMain,
                                                flex: `1 0 ${gridBasis}`,
                                                maxWidth: gridBasis,
                                                minHeight: 'clamp(86px, 12vh, 132px)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                textAlign: 'center' as const,
                                                boxShadow: isLight ? '0 2px 6px rgba(82, 66, 45, 0.06)' : 'none',
                                            }}
                                        >
                                            {selected ? '\u2611 ' : '\u2610 '}{opt}
                                        </GazeButton>
                                    );
                                })
                            }

                            {/* ── ACTION / DISPLAY ── */}
                            {(currentQ.type === 'action' || currentQ.type === 'display') &&
                                currentOptions.map((opt: string) => (
                                    <GazeButton
                                        key={opt}
                                        id={`act-${opt}`}
                                        onClick={() => handleAnswer(opt)}
                                        gazeEnabled={effectiveGazeActive}
                                        gazeEnabledTimestamp={effectiveGazeTimestamp}
                                        dwellCategory="surveyOption"
                                        isDarkMode={isDarkMode}
                                        style={{
                                            padding: 'clamp(24px, 3.2vh, 38px)',
                                            fontSize: 'clamp(24px, 3.2vh, 34px)',
                                            background: T_accent,
                                            color: '#FFF',
                                            fontWeight: 700,
                                            borderRadius: '16px',
                                            width: '100%',
                                            minHeight: 'clamp(86px, 12vh, 132px)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            border: 'none',
                                            boxShadow: isLight ? '0 4px 10px rgba(31, 107, 126, 0.18)' : 'none',
                                        }}
                                    >
                                        {opt}
                                    </GazeButton>
                                ))
                            }

                            {/* ── DISPLAY (no options, just continue) ── */}
                            {currentQ.type === 'display' && currentOptions.length === 0 && (
                                <GazeButton
                                    id="display-continue"
                                    onClick={advanceQuestion}
                                    gazeEnabled={effectiveGazeActive}
                                    gazeEnabledTimestamp={effectiveGazeTimestamp}
                                    dwellCategory="surveyOption"
                                    isDarkMode={isDarkMode}
                                    style={{
                                        padding: 'clamp(22px, 3vh, 36px)',
                                        background: T_accent,
                                        color: '#FFF',
                                        borderRadius: '16px',
                                        width: '100%',
                                        fontSize: 'clamp(24px, 3.1vh, 34px)',
                                        fontWeight: 700,
                                        border: 'none',
                                        minHeight: 'clamp(86px, 12vh, 132px)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: isLight ? '0 4px 10px rgba(31, 107, 126, 0.18)' : 'none',
                                    }}
                                >
                                    Continue
                                </GazeButton>
                            )}

                            {/* ── TEXT INPUT ── */}
                            {currentQ.type === 'text' && (
                                <div style={{
                                    width: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 'clamp(10px, 1.2vh, 16px)',
                                }}>
                                    <textarea
                                        value={answers[currentQ.dataKey!] || ''}
                                        onChange={(e) => setAnswers({
                                            ...answers,
                                            [currentQ.dataKey!]: e.target.value,
                                        })}
                                        style={{
                                            width: '100%',
                                            minHeight: 'clamp(100px, 14vh, 150px)',
                                            padding: '18px',
                                            fontSize: 'clamp(18px, 2.3vh, 24px)',
                                            background: T_optionBg,
                                            border: T_optionBorder,
                                            borderRadius: '16px',
                                            color: T_textMain,
                                            resize: 'none',
                                            fontFamily: UI_FONT,
                                            boxShadow: isLight ? '0 2px 6px rgba(82, 66, 45, 0.06)' : 'none',
                                        }}
                                    />
                                    <div style={{ display: 'flex', gap: '16px' }}>
                                        <GazeButton
                                            id="skip-text"
                                            onClick={() => handleAnswer('Skipped')}
                                            gazeEnabled={effectiveGazeActive}
                                            gazeEnabledTimestamp={navGazeTimestamp}
                                            isDarkMode={isDarkMode}
                                            style={{
                                                flex: 1,
                                                padding: 'clamp(18px, 2.4vh, 26px)',
                                                background: T_optionBg,
                                                border: T_optionBorder,
                                                color: T_textSub,
                                                borderRadius: '14px',
                                                fontSize: 'clamp(18px, 2.2vh, 24px)',
                                                fontWeight: 700,
                                                minHeight: 'clamp(64px, 8.5vh, 88px)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                        >
                                            Skip
                                        </GazeButton>
                                        <GazeButton
                                            id="submit-text"
                                            onClick={() => handleAnswer(answers[currentQ.dataKey!] || 'No input')}
                                            gazeEnabled={effectiveGazeActive}
                                            gazeEnabledTimestamp={effectiveGazeTimestamp}
                                            dwellCategory="surveyOption"
                                            isDarkMode={isDarkMode}
                                            style={{
                                                flex: 2,
                                                padding: 'clamp(18px, 2.4vh, 26px)',
                                                background: T_accent,
                                                color: '#FFF',
                                                borderRadius: '14px',
                                                fontSize: 'clamp(18px, 2.2vh, 24px)',
                                                fontWeight: 700,
                                                border: 'none',
                                                minHeight: 'clamp(64px, 8.5vh, 88px)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                boxShadow: isLight ? '0 4px 10px rgba(31, 107, 126, 0.18)' : 'none',
                                            }}
                                        >
                                            SUBMIT
                                        </GazeButton>
                                    </div>
                                </div>
                            )}

                            {/* ── SCROLLABLE-DISPLAY (Review) ── */}
                            {currentQ.type === 'scrollable-display' && (
                                <div style={{ width: '100%' }}>
                                    <div style={{
                                        maxHeight: 'clamp(200px, 30vh, 350px)',
                                        overflowY: 'auto',
                                        background: isLight ? 'rgba(82, 66, 45, 0.06)' : 'rgba(0,0,0,0.2)',
                                        border: isLight ? `1px solid ${lightColors.border.light}` : 'none',
                                        borderRadius: '14px',
                                        padding: '16px',
                                        marginBottom: '14px',
                                    }}>
                                        <pre style={{
                                            whiteSpace: 'pre-wrap',
                                            fontFamily: 'monospace',
                                            color: T_textMain,
                                            fontSize: 'clamp(13px, 1.5vh, 16px)',
                                        }}>
                                            {JSON.stringify(answers, null, 2)}
                                        </pre>
                                    </div>
                                    <GazeButton
                                        id="review-continue"
                                        onClick={advanceQuestion}
                                        gazeEnabled={effectiveGazeActive}
                                        gazeEnabledTimestamp={effectiveGazeTimestamp}
                                        dwellCategory="surveyOption"
                                        isDarkMode={isDarkMode}
                                        style={{
                                            padding: 'clamp(22px, 3vh, 36px)',
                                            background: T_accent,
                                            color: '#FFF',
                                            borderRadius: '16px',
                                            width: '100%',
                                            fontWeight: 700,
                                            border: 'none',
                                            minHeight: 'clamp(86px, 12vh, 132px)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: 'clamp(24px, 3.1vh, 34px)',
                                            boxShadow: isLight ? '0 4px 10px rgba(31, 107, 126, 0.18)' : 'none',
                                        }}
                                    >
                                        Proceed to Final Step
                                    </GazeButton>
                                </div>
                            )}

                        </div>
                    </div>

                </div>
            </div>

            {/* ═══ COMMAND BAR — Fixed single-row, gaze-centered ═══
                Layout: [ BACK ] ←40px→ [ ◉ GAZE ] ←40px→ [ SUMMARY ] [ CONFIRM? ] [ SKIP ]
                Vertical Stack (top→bottom): Content → Command Bar → Dead Zone
            */}
            {/* Fade overlay above shelf — only over the options (right) area; never over the question (left) column */}
            <div style={{
                position: 'fixed',
                left: 'clamp(220px, 24%, 380px)',
                right: 0,
                bottom: 0,
                height: 'clamp(180px, 22vh, 260px)',
                pointerEvents: 'none',
                zIndex: 1998,
                background: isLight
                    ? `linear-gradient(180deg, ${lightColors.background.primary}00 0%, ${lightColors.background.primary}d8 28%, ${lightColors.background.primary} 60%, ${lightColors.background.primary} 100%)`
                    : `linear-gradient(180deg, ${THEME.bg}00 0%, ${THEME.bg}cc 28%, ${THEME.bg} 60%, ${THEME.bg} 100%)`,
            }} />

            <div style={{
                position: 'fixed',
                bottom: 0,
                left: 'clamp(220px, 24%, 380px)',
                right: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                zIndex: 1999,
                background: isLight ? lightColors.background.primary : THEME.bg,
                paddingBottom: 'clamp(28px, 4vh, 52px)',
            }}>
                {/* Subtle horizontal divider that visually connects the row */}
                <div style={{
                    height: '1px',
                    width: 'min(94%, 1300px)',
                    margin: '0 auto',
                    background: isLight
                        ? 'linear-gradient(90deg, rgba(82, 66, 45, 0) 0%, rgba(82, 66, 45, 0.28) 25%, rgba(82, 66, 45, 0.28) 75%, rgba(82, 66, 45, 0) 100%)'
                        : 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.16) 25%, rgba(255,255,255,0.16) 75%, rgba(255,255,255,0) 100%)',
                    marginBottom: 'clamp(14px, 2vh, 22px)',
                }} />

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 'clamp(40px, 4.5vw, 76px)',
                    padding: '0 clamp(20px, 2.5vw, 40px)',
                }}>
                    <GazeButton
                        id="nav-back"
                        onClick={handleBack}
                        gazeEnabled={effectiveGazeActive}
                        gazeEnabledTimestamp={navGazeTimestamp}
                        isDarkMode={isDarkMode}
                        dwellCategory="backSkipButton"
                        style={{
                            padding: 'clamp(26px, 3.2vh, 40px) clamp(36px, 4vw, 60px)',
                            background: isLight ? lightColors.background.elevated : 'rgba(255,255,255,0.04)',
                            border: isLight ? `1.5px solid ${lightColors.border.main}` : '2px solid rgba(255,255,255,0.15)',
                            borderRadius: '18px',
                            color: T_textMain,
                            fontSize: 'clamp(21px, 2.6vh, 29px)',
                            fontWeight: 700,
                            minHeight: 'clamp(96px, 12.5vh, 134px)',
                            minWidth: 'clamp(210px, 18vw, 280px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: isLight ? '0 4px 12px rgba(82, 66, 45, 0.10)' : '0 4px 14px rgba(0,0,0,0.20)',
                        }}
                    >
                        {'← BACK'}
                    </GazeButton>
                    <GazeButton
                        id="view-summary"
                        onClick={() => setShowSummary(true)}
                        gazeEnabled={effectiveGazeActive}
                        gazeEnabledTimestamp={navGazeTimestamp}
                        isDarkMode={isDarkMode}
                        dwellCategory="navigationButton"
                        style={{
                            padding: 'clamp(26px, 3.2vh, 40px) clamp(36px, 4vw, 60px)',
                            background: T_accentSoft,
                            border: `2px solid ${T_accentBorder}`,
                            borderRadius: '18px',
                            color: T_accent,
                            fontSize: 'clamp(21px, 2.6vh, 29px)',
                            fontWeight: 700,
                            minHeight: 'clamp(96px, 12.5vh, 134px)',
                            minWidth: 'clamp(240px, 20vw, 320px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: isLight ? '0 4px 12px rgba(31, 107, 126, 0.14)' : '0 4px 14px rgba(0,0,0,0.20)',
                        }}
                    >
                        VIEW SUMMARY
                    </GazeButton>

                    {Object.keys(answers).filter(k => answers[k] && answers[k] !== 'SKIPPED').length >= 5 && (
                        <GazeButton
                            id="gen-fp-survey"
                            onClick={handleGenerateFromSurvey}
                            gazeEnabled={effectiveGazeActive}
                            gazeEnabledTimestamp={navGazeTimestamp}
                            isDarkMode={isDarkMode}
                            dwellCategory="compassMapAction"
                            style={{
                                padding: 'clamp(26px, 3.2vh, 40px) clamp(32px, 3.6vw, 52px)',
                                background: isLight ? 'rgba(31, 107, 126, 0.16)' : 'rgba(100, 181, 246, 0.12)',
                                border: `2px solid ${isLight ? 'rgba(31, 107, 126, 0.55)' : 'rgba(100, 181, 246, 0.5)'}`,
                                borderRadius: '18px',
                                color: T_accent,
                                fontSize: 'clamp(19px, 2.3vh, 25px)',
                                fontWeight: 700,
                                minHeight: 'clamp(96px, 12.5vh, 134px)',
                                minWidth: 'clamp(240px, 20vw, 320px)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: isLight ? '0 4px 12px rgba(31, 107, 126, 0.14)' : '0 4px 14px rgba(0,0,0,0.20)',
                            }}
                        >
                            ◇ FLOOR PLAN
                        </GazeButton>
                    )}

                    {/* ✓ CONFIRM (multi-select only) */}
                    {currentQ.type === 'multi' && (
                        <GazeButton
                            id="multi-done"
                            onClick={advanceQuestion}
                            gazeEnabled={effectiveGazeActive}
                            gazeEnabledTimestamp={navGazeTimestamp}
                            isDarkMode={isDarkMode}
                            dwellCategory="surveyOption"
                            style={{
                                padding: 'clamp(26px, 3.2vh, 40px) clamp(36px, 4vw, 60px)',
                                background: T_accent,
                                border: 'none',
                                borderRadius: '18px',
                                color: '#FFFFFF',
                                fontSize: 'clamp(21px, 2.6vh, 29px)',
                                fontWeight: 700,
                                minHeight: 'clamp(96px, 12.5vh, 134px)',
                                minWidth: 'clamp(220px, 19vw, 300px)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: isLight ? '0 6px 16px rgba(31, 107, 126, 0.22)' : '0 4px 14px rgba(0,0,0,0.20)',
                            }}
                        >
                            {'\u2713 CONFIRM'}
                        </GazeButton>
                    )}

                    <GazeButton
                        id="nav-skip"
                        onClick={handleSkip}
                        gazeEnabled={effectiveGazeActive}
                        gazeEnabledTimestamp={navGazeTimestamp}
                        isDarkMode={isDarkMode}
                        dwellCategory="backSkipButton"
                        style={{
                            padding: 'clamp(26px, 3.2vh, 40px) clamp(36px, 4vw, 60px)',
                            background: T_warningSoft,
                            border: `2px solid ${T_warningBorder}`,
                            borderRadius: '18px',
                            color: T_warning,
                            fontSize: 'clamp(21px, 2.6vh, 29px)',
                            fontWeight: 700,
                            minHeight: 'clamp(96px, 12.5vh, 134px)',
                            minWidth: 'clamp(210px, 18vw, 280px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: isLight ? '0 4px 12px rgba(168, 120, 56, 0.14)' : '0 4px 14px rgba(0,0,0,0.20)',
                        }}
                    >
                        {'SKIP →'}
                    </GazeButton>
                </div>
            </div>

            {/* ════ SUMMARY MODAL — Full-screen, beautifully formatted ════ */}
            {showSummary && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isLight ? 'rgba(74, 58, 42, 0.55)' : 'rgba(0,0,0,0.84)',
                }}>
                    <div style={{
                        background: isLight ? lightColors.background.elevated : THEME.panelBg,
                        border: `1px solid ${isLight ? lightColors.border.main : THEME.border}`, borderRadius: '20px',
                        width: '92%', maxWidth: '850px', maxHeight: '88vh',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        boxShadow: isLight ? '0 12px 28px rgba(82, 66, 45, 0.20)' : '0 8px 24px rgba(0,0,0,0.24)',
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            padding: 'clamp(16px, 2.2vh, 24px) clamp(20px, 2.5vw, 32px)',
                            borderBottom: `1px solid ${isLight ? lightColors.border.light : 'rgba(100,116,139,0.15)'}`, flexShrink: 0,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <h2 style={{ color: T_textMain, fontSize: 'clamp(20px, 2.8vh, 30px)', fontWeight: 700, margin: 0 }}>
                                Design Survey Summary
                            </h2>
                            <div style={{ display: 'flex', gap: 'clamp(8px, 1vw, 16px)' }}>
                                <GazeButton id="save-summary" onClick={handleSaveProgress}
                                    gazeEnabled={true} alwaysActive={true} gazeEnabledTimestamp={0} isDarkMode={!isLight}
                                    dwellCategory="compassMapAction"
                                    style={{
                                        padding: 'clamp(10px, 1.4vh, 16px) clamp(18px, 2.2vw, 30px)',
                                        background: T_accentSoft,
                                        border: `2px solid ${T_accentBorder}`,
                                        borderRadius: '12px',
                                        color: T_accent,
                                        fontSize: 'clamp(14px, 1.8vh, 19px)', fontWeight: 700,
                                    }}>
                                    SAVE PROGRESS
                                </GazeButton>
                                <GazeButton id="close-summary" onClick={() => setShowSummary(false)}
                                    gazeEnabled={true} alwaysActive={true} gazeEnabledTimestamp={0} isDarkMode={!isLight}
                                    dwellCategory="backSkipButton"
                                    style={{
                                        padding: 'clamp(10px, 1.4vh, 16px) clamp(18px, 2.2vw, 30px)',
                                        background: T_accent, color: '#FFF', borderRadius: '12px',
                                        fontSize: 'clamp(14px, 1.8vh, 19px)', fontWeight: 700, border: 'none',
                                    }}>
                                    CLOSE
                                </GazeButton>
                            </div>
                        </div>
                        {/* Modal Body */}
                        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                            <SummaryPanel answers={answers} questions={SURVEY_QUESTIONS} currentPhase={currentPhaseId} isLight={isLight} />
                        </div>
                    </div>
                </div>
            )}

            {/* ════ SAVE/GENERATE MODAL ════ */}
            {showModal && <SaveConfirmModal mode={showModal} onClose={handleModalClose} isLight={isLight} />}

            {showFloorPlanViewer && surveyData?.compass_map && (
                <FloorPlanViewerModal
                    compassData={enrichWithSurveyData(
                        surveyData.compass_map as CompassMapPayload,
                        answers,
                    )}
                    onClose={() => setShowFloorPlanViewer(false)}
                    onSpeak={onSpeak}
                    surveyData={{ ...(surveyData || {}), answers: { ...(surveyData?.answers || {}), ...answers } }}
                    initialCustomNotes={[answers.special_requests, answers.final_notes].filter(v => typeof v === 'string' && v.trim()).join('\n')}
                />
            )}
        </div>
    );
}

export default React.memo(FloorPlanSurveyScreen);
