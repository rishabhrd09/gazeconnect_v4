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
import { screenThemes, typography } from '../utils/design';
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
    if (count <= 4) return '48%';
    if (count <= 6) return '31%';
    if (count <= 9) return '31%';
    return '23%';
}

// ─── SummaryPanel (for Summary Modal) — Beautiful, well-formatted ────

const SummaryPanel = ({
    answers, questions, currentPhase,
}: {
    answers: Record<string, any>; questions: SurveyQuestion[]; currentPhase: string;
}) => {
    const completeness = useMemo(() => computeCompleteness(answers, questions), [answers, questions]);
    const answeredCount = Object.keys(answers).filter(k => answers[k] !== undefined && answers[k] !== 'SKIPPED').length;
    const skippedCount = Object.values(answers).filter(v => v === 'SKIPPED').length;

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
            <div style={{ padding: 'clamp(16px, 2vh, 24px) clamp(20px, 2.5vw, 32px)', borderBottom: '1px solid rgba(100,116,139,0.12)', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: 'clamp(14px, 1.8vh, 18px)', color: THEME.textMain, fontWeight: 700 }}>
                        Overall Progress
                    </span>
                    <span style={{ fontSize: 'clamp(18px, 2.2vh, 24px)', color: THEME.accent, fontWeight: 700 }}>
                        {completeness.percentage}%
                    </span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden', marginBottom: '12px' }}>
                    <div style={{ width: `${completeness.percentage}%`, height: '100%', background: THEME.accent, borderRadius: '3px', transition: 'width 0.3s ease' }} />
                </div>
                <div style={{ display: 'flex', gap: 'clamp(16px, 2vw, 32px)' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 'clamp(20px, 2.5vh, 28px)', fontWeight: 700, color: THEME.accent }}>{answeredCount}</div>
                        <div style={{ fontSize: 'clamp(11px, 1.3vh, 14px)', color: THEME.textSub, fontWeight: 600 }}>Answered</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 'clamp(20px, 2.5vh, 28px)', fontWeight: 700, color: THEME.warning }}>{skippedCount}</div>
                        <div style={{ fontSize: 'clamp(11px, 1.3vh, 14px)', color: THEME.textSub, fontWeight: 600 }}>Skipped</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 'clamp(20px, 2.5vh, 28px)', fontWeight: 700, color: THEME.textSub }}>{completeness.total - answeredCount - skippedCount}</div>
                        <div style={{ fontSize: 'clamp(11px, 1.3vh, 14px)', color: THEME.textSub, fontWeight: 600 }}>Remaining</div>
                    </div>
                </div>
            </div>
            {/* Per-phase answers */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 'clamp(12px, 1.5vh, 20px) clamp(20px, 2.5vw, 32px)' }}>
                {phaseGroups.length === 0 ? (
                    <div style={{ color: THEME.textDim, fontStyle: 'italic', padding: '40px 0', textAlign: 'center', fontSize: 'clamp(15px, 1.8vh, 19px)' }}>
                        No answers recorded yet. Start answering questions to see your summary here.
                    </div>
                ) : (
                    phaseGroups.map(group => (
                        <div key={group.phase} style={{ marginBottom: 'clamp(16px, 2vh, 28px)' }}>
                            <div style={{
                                color: group.phase === currentPhase ? THEME.accent : THEME.textMain,
                                fontSize: 'clamp(16px, 2vh, 22px)',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '1.5px',
                                marginBottom: 'clamp(8px, 1vh, 14px)',
                                paddingBottom: '8px',
                                borderBottom: `2px solid ${group.phase === currentPhase ? THEME.accent + '40' : 'rgba(100,116,139,0.12)'}`,
                            }}>
                                {group.phase}
                                <span style={{ fontSize: 'clamp(12px, 1.3vh, 14px)', color: THEME.textSub, fontWeight: 500, marginLeft: '10px', textTransform: 'none', letterSpacing: '0' }}>
                                    ({group.items.length} {group.items.length === 1 ? 'answer' : 'answers'})
                                </span>
                            </div>
                            {group.items.map((item, i) => (
                                <div key={i} style={{
                                    marginBottom: 'clamp(8px, 1vh, 14px)',
                                    padding: 'clamp(8px, 1vh, 14px) clamp(10px, 1.2vw, 16px)',
                                    background: item.skipped ? 'rgba(245, 158, 11, 0.06)' : 'rgba(255,255,255,0.03)',
                                    borderRadius: '10px',
                                    borderLeft: `3px solid ${item.skipped ? THEME.warning : THEME.accent}`,
                                }}>
                                    <div style={{ color: THEME.textSub, fontSize: 'clamp(12px, 1.4vh, 15px)', marginBottom: '4px', lineHeight: 1.3 }}>
                                        {item.question}
                                    </div>
                                    <div style={{
                                        color: item.skipped ? THEME.warning : THEME.textMain,
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

const SaveConfirmModal = ({ mode, onClose }: { mode: 'generate' | 'save'; onClose: () => void }) => (
    <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.78)',
    }}>
        <div style={{
            background: THEME.panelBg, border: `1px solid ${THEME.border}`,
            borderRadius: '20px', padding: 'clamp(24px, 4vh, 48px)', maxWidth: '480px', width: '90%',
            textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.24)',
            fontFamily: UI_FONT,
        }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                {mode === 'generate' ? '\u2705' : '\u{1F4BE}'}
            </div>
            <h2 style={{ color: THEME.textMain, fontSize: 'clamp(18px, 2.5vh, 28px)', marginBottom: '12px', fontWeight: 700 }}>
                {mode === 'generate' ? 'Plan Generated!' : 'Progress Saved'}
            </h2>
            <p style={{ color: THEME.textSub, fontSize: 'clamp(13px, 1.6vh, 17px)', lineHeight: 1.5, marginBottom: '24px' }}>
                {mode === 'generate'
                    ? 'Files saved to survey_data folder. You can review and refine these with your architect or caregiver.'
                    : 'Your progress has been saved. You can resume anytime from Design Home.'}
            </p>
            <GazeButton id="modal-ok" onClick={onClose} gazeEnabled={true} alwaysActive={true} gazeEnabledTimestamp={0} isDarkMode={true}
                style={{ padding: 'clamp(12px, 1.8vh, 20px) clamp(32px, 5vw, 64px)', background: THEME.accent, color: '#FFF', borderRadius: '12px', fontSize: 'clamp(14px, 1.8vh, 20px)', fontWeight: 700, border: 'none' }}>
                OK {mode === 'generate' ? '\u2014 Return to Home' : ''}
            </GazeButton>
        </div>
    </div>
);

// ─── Main Screen Component ─────────────────────────────────

function FloorPlanSurveyScreen({ onNavigate, onSpeak, isGazeEnabled: globalGazeEnabled }: any) {
    const [answers, setAnswers] = useState<Record<string, any>>({});
    const [qIndex, setQIndex] = useState(0);
    const [sessionLoaded, setSessionLoaded] = useState(false);
    const [isDarkMode] = useState(true);
    const [showModal, setShowModal] = useState<'generate' | 'save' | null>(null);
    const [showSummary, setShowSummary] = useState(false);
    const [showFloorPlanViewer, setShowFloorPlanViewer] = useState(false);

    const { isGazeEnabled, lastEnabledTimestamp, toggleGaze } = useGazeControl();
    const { isLight } = useTheme();
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

    // v16: Per-question gaze control — disabled by default on each new question.
    // User reads the question first, then enables gaze via EITHER button to select.
    // Both the center ENABLE GAZE button and the global NavBar footer toggle are kept in sync.
    const [surveyGazeActive, setSurveyGazeActive] = useState(false);
    const [surveyGazeTimestamp, setSurveyGazeTimestamp] = useState(0);
    const lockSurveyGaze = () => {
        setSurveyGazeActive(false);
        setSurveyGazeTimestamp(0);
        if (isGazeEnabled) toggleGaze();
    };

    // Reset BOTH toggles when question changes — user must re-enable after reading
    useEffect(() => {
        setSurveyGazeActive(false);
        setSurveyGazeTimestamp(0);
        if (isGazeEnabled) toggleGaze();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [qIndex]);

    // Sync: when global NavBar toggle changes, mirror to local survey state
    useEffect(() => {
        setSurveyGazeActive(isGazeEnabled);
        if (isGazeEnabled) {
            setSurveyGazeTimestamp(Date.now());
        } else {
            setSurveyGazeTimestamp(0);
        }
    }, [isGazeEnabled]);

    // Center ENABLE GAZE button: toggle local + sync global
    const handleSurveyGazeToggle = () => {
        const next = !surveyGazeActive;
        setSurveyGazeActive(next);
        if (next) {
            setSurveyGazeTimestamp(Date.now());
        } else {
            setSurveyGazeTimestamp(0);
        }
        // Keep global NavBar toggle in sync
        if (next !== isGazeEnabled) toggleGaze();
    };

    // Effective state for option buttons (both toggles in sync, so surveyGazeActive suffices)
    const effectiveGazeActive = surveyGazeActive;
    const effectiveGazeTimestamp = surveyGazeTimestamp;

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
        return <div style={{ color: THEME.textMain, padding: 40, background: THEME.bg }}>Loading Question...</div>;
    }

    // ── Derived: current phase index, options, grid basis ──
    const currentPhaseIndex = UNIQUE_PHASES.indexOf(currentQ.phase);
    const currentOptions = getQuestionOptions(currentQ, answers);
    const gridBasis = getGridBasis(currentOptions.length);

    // ── Handlers ──
    const advanceQuestion = () => {
        if (isLast) return;
        lockSurveyGaze();
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
        lockSurveyGaze();
        setQIndex(prev => Math.max(0, prev - 1));
    };

    // ── Jump to first question of a clicked phase ──
    const handlePhaseClick = (phase: string) => {
        const firstIdx = activeQuestions.findIndex(q => q.phase === phase);
        if (firstIdx >= 0) {
            lockSurveyGaze();
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
        <div className={`survey-screen${isLight ? ' theme-light' : ''}`} style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            backgroundColor: THEME.bg,
            color: THEME.textMain,
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
                borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
                background: 'rgba(0, 0, 0, 0.15)',
                padding: 'clamp(6px, 0.8vh, 10px) clamp(8px, 1vw, 16px)',
            }}>
                {/* Phase Tabs — comfortable margins, stacked multi-word labels */}
                <div style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    justifyContent: 'space-evenly',
                    gap: 'clamp(6px, 0.8vw, 14px)',
                    width: '80%',
                    margin: '0 auto',
                }}>
                    {UNIQUE_PHASES.map((phase, i) => {
                        const isCurrent = phase === currentQ.phase;
                        const isPast = i < currentPhaseIndex;
                        // Split multi-word labels into stacked lines
                        const words = phase.split(' ');
                        const isMultiWord = words.length > 1;
                        return (
                            <GazeButton
                                key={phase}
                                id={`phase-tab-${phase}`}
                                onClick={() => handlePhaseClick(phase)}
                                gazeEnabled={effectiveGazeActive}
                                gazeEnabledTimestamp={effectiveGazeTimestamp}
                                isDarkMode={isDarkMode}
                                style={{
                                    padding: isMultiWord
                                        ? 'clamp(4px, 0.6vh, 8px) clamp(10px, 1.2vw, 18px)'
                                        : 'clamp(10px, 1.4vh, 16px) clamp(10px, 1.2vw, 18px)',
                                    fontSize: '1.1rem',
                                    fontWeight: 700,
                                    fontFamily: UI_FONT,
                                    color: isCurrent ? THEME.accent : '#FFFFFF',
                                    background: isCurrent ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                                    border: 'none',
                                    borderRadius: '6px 6px 0 0',
                                    borderBottom: isCurrent ? `3px solid ${THEME.accent}` : '3px solid transparent',
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
                        color: THEME.textSub,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                    }}>
                        {qIndex + 1} / {activeQuestions.length}
                    </span>
                    <div style={{
                        flex: 1,
                        height: '5px',
                        background: 'rgba(255,255,255,0.08)',
                        borderRadius: '3px',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            width: `${((qIndex + 1) / activeQuestions.length) * 100}%`,
                            height: '100%',
                            background: THEME.accent,
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
                    padding: 'clamp(18px, 3vh, 36px) clamp(16px, 1.8vw, 28px)',
                    borderRight: '1px solid rgba(148, 163, 184, 0.12)',
                    overflowY: 'auto',
                }}>
                    {/* Phase Label */}
                    <div style={{
                        fontSize: 'clamp(18px, 2.3vh, 25px)',
                        fontWeight: 800,
                        color: THEME.accent,
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
                        color: THEME.textMain,
                    }}>
                        {currentQ.text}
                    </div>

                    {/* Subtext */}
                    {currentQ.subtext && (
                        <div style={{
                            fontSize: 'clamp(17px, 2.1vh, 23px)',
                            color: THEME.textSub,
                            lineHeight: 1.5,
                        }}>
                            {currentQ.subtext}
                        </div>
                    )}

                    {/* Help Text */}
                    {currentQ.helpText && (
                        <div style={{
                            fontSize: 'clamp(16px, 1.9vh, 21px)',
                            color: THEME.warning,
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
                            color: THEME.warning,
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
                            paddingBottom: 'clamp(190px, 26vh, 310px)',
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        {/* Options Grid */}
                        <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 'clamp(10px, 1.3vh, 18px)',
                            justifyContent: 'flex-start',
                            alignContent: 'flex-start',
                        }}>

                            {/* ── GRID / COORDINATE-INPUT ── */}
                            {(currentQ.type === 'grid' || currentQ.type === 'coordinate-input') &&
                                currentOptions.map((opt: string) => (
                                    <GazeButton
                                        key={opt}
                                        id={`opt-${opt}`}
                                        onClick={() => handleAnswer(opt)}
                                        gazeEnabled={effectiveGazeActive}
                                        gazeEnabledTimestamp={effectiveGazeTimestamp}
                                        isDarkMode={isDarkMode}
                                        style={{
                                            padding: 'clamp(16px, 2.2vh, 26px) clamp(14px, 1.6vw, 24px)',
                                            fontSize: 'clamp(20px, 2.6vh, 28px)',
                                            fontWeight: 600,
                                            background: THEME.panelBg,
                                            border: '1px solid rgba(100, 116, 139, 0.2)',
                                            borderRadius: '14px',
                                            color: THEME.textMain,
                                            flex: `1 0 ${gridBasis}`,
                                            maxWidth: gridBasis,
                                            minHeight: 'clamp(68px, 9vh, 100px)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            textAlign: 'center' as const,
                                        }}
                                    >
                                        {opt}
                                    </GazeButton>
                                ))
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
                                            isDarkMode={isDarkMode}
                                            style={{
                                                padding: 'clamp(16px, 2.2vh, 26px) clamp(14px, 1.6vw, 24px)',
                                                fontSize: 'clamp(20px, 2.6vh, 28px)',
                                                fontWeight: 600,
                                                background: selected ? 'rgba(100, 181, 246, 0.18)' : THEME.panelBg,
                                                border: selected
                                                    ? `2px solid ${THEME.accent}`
                                                    : '1px solid rgba(100, 116, 139, 0.2)',
                                                borderRadius: '14px',
                                                color: THEME.textMain,
                                                flex: `1 0 ${gridBasis}`,
                                                maxWidth: gridBasis,
                                                minHeight: 'clamp(68px, 9vh, 100px)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                textAlign: 'center' as const,
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
                                        isDarkMode={isDarkMode}
                                        style={{
                                            padding: 'clamp(18px, 2.5vh, 28px)',
                                            fontSize: 'clamp(21px, 2.8vh, 30px)',
                                            background: THEME.accent,
                                            color: '#FFF',
                                            fontWeight: 700,
                                            borderRadius: '14px',
                                            width: '100%',
                                            minHeight: 'clamp(68px, 9vh, 100px)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            border: 'none',
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
                                    isDarkMode={isDarkMode}
                                    style={{
                                        padding: 'clamp(16px, 2.2vh, 26px)',
                                        background: THEME.accent,
                                        color: '#FFF',
                                        borderRadius: '14px',
                                        width: '100%',
                                        fontSize: 'clamp(20px, 2.6vh, 28px)',
                                        fontWeight: 700,
                                        border: 'none',
                                        minHeight: 'clamp(68px, 9vh, 100px)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
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
                                    gap: 'clamp(8px, 1vh, 14px)',
                                }}>
                                    <textarea
                                        value={answers[currentQ.dataKey!] || ''}
                                        onChange={(e) => setAnswers({
                                            ...answers,
                                            [currentQ.dataKey!]: e.target.value,
                                        })}
                                        style={{
                                            width: '100%',
                                            minHeight: 'clamp(80px, 12vh, 120px)',
                                            padding: '14px',
                                            fontSize: 'clamp(16px, 2vh, 20px)',
                                            background: THEME.panelBg,
                                            border: '1px solid rgba(100, 116, 139, 0.2)',
                                            borderRadius: '14px',
                                            color: THEME.textMain,
                                            resize: 'none',
                                        }}
                                    />
                                    <div style={{ display: 'flex', gap: '14px' }}>
                                        <GazeButton
                                            id="skip-text"
                                            onClick={() => handleAnswer('Skipped')}
                                            gazeEnabled={effectiveGazeActive}
                                            gazeEnabledTimestamp={effectiveGazeTimestamp}
                                            isDarkMode={isDarkMode}
                                            style={{
                                                flex: 1,
                                                padding: 'clamp(12px, 1.5vh, 18px)',
                                                background: 'transparent',
                                                border: '1px solid rgba(255,255,255,0.15)',
                                                color: THEME.textSub,
                                                borderRadius: '12px',
                                                fontSize: 'clamp(15px, 1.8vh, 20px)',
                                                fontWeight: 600,
                                                minHeight: 'clamp(48px, 6vh, 60px)',
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
                                            isDarkMode={isDarkMode}
                                            style={{
                                                flex: 2,
                                                padding: 'clamp(12px, 1.5vh, 18px)',
                                                background: THEME.accent,
                                                color: '#FFF',
                                                borderRadius: '12px',
                                                fontSize: 'clamp(15px, 1.8vh, 20px)',
                                                fontWeight: 700,
                                                border: 'none',
                                                minHeight: 'clamp(48px, 6vh, 60px)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
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
                                        background: 'rgba(0,0,0,0.2)',
                                        borderRadius: '12px',
                                        padding: '14px',
                                        marginBottom: '12px',
                                    }}>
                                        <pre style={{
                                            whiteSpace: 'pre-wrap',
                                            fontFamily: 'monospace',
                                            color: THEME.textMain,
                                            fontSize: 'clamp(12px, 1.3vh, 14px)',
                                        }}>
                                            {JSON.stringify(answers, null, 2)}
                                        </pre>
                                    </div>
                                    <GazeButton
                                        id="review-continue"
                                        onClick={advanceQuestion}
                                        gazeEnabled={effectiveGazeActive}
                                        gazeEnabledTimestamp={effectiveGazeTimestamp}
                                        isDarkMode={isDarkMode}
                                        style={{
                                            padding: 'clamp(16px, 2.2vh, 26px)',
                                            background: THEME.accent,
                                            color: '#FFF',
                                            borderRadius: '14px',
                                            width: '100%',
                                            fontWeight: 700,
                                            border: 'none',
                                            minHeight: 'clamp(68px, 9vh, 100px)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: 'clamp(20px, 2.6vh, 28px)',
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
            <div style={{
                position: 'fixed',
                bottom: 'clamp(45px, 6.5vh, 70px)',
                left: '53%',
                transform: 'translateX(-50%)',
                width: 'clamp(700px, 78%, 1300px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1999,
                background: 'transparent',
                padding: 'clamp(10px, 1.4vh, 18px) clamp(16px, 2vw, 32px)',
            }}>

                {/* ── LEFT WING: BACK ── */}
                <div style={{
                    flex: 1,
                    display: 'flex',
                    justifyContent: 'flex-end',
                    paddingRight: 'clamp(30px, 4vw, 60px)',
                }}>
                    <GazeButton
                        id="nav-back"
                        onClick={handleBack}
                        gazeEnabled={effectiveGazeActive}
                        gazeEnabledTimestamp={effectiveGazeTimestamp}
                        isDarkMode={isDarkMode}
                        style={{
                            padding: 'clamp(10px, 1.4vh, 16px) clamp(20px, 2.5vw, 36px)',
                            background: 'rgba(255,255,255,0.04)',
                            border: '2px solid rgba(255,255,255,0.15)',
                            borderRadius: '14px',
                            color: THEME.textMain,
                            fontSize: 'clamp(15px, 1.9vh, 21px)',
                            fontWeight: 700,
                            minHeight: 'clamp(50px, 6.5vh, 68px)',
                            minWidth: 'clamp(110px, 11vw, 155px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {'← BACK'}
                    </GazeButton>
                </div>

                {/* ── CENTER ANCHOR: ENABLE GAZE (circular, prominent) ── */}
                {/* v15: Toggles LOCAL survey gaze, not global. Resets per question. */}
                <GazeButton
                    id="gaze-toggle-survey"
                    onClick={handleSurveyGazeToggle}
                    gazeEnabled={true}
                    alwaysActive={true}
                    gazeEnabledTimestamp={lastEnabledTimestamp}
                    isDarkMode={isDarkMode}
                    style={{
                        flexShrink: 0,
                        padding: '0',
                        width: 'clamp(100px, 13vh, 165px)',
                        height: 'clamp(100px, 13vh, 165px)',
                        minWidth: 'clamp(100px, 13vh, 165px)',
                        borderRadius: '50%',
                        background: effectiveGazeActive ? THEME.successSubtle : THEME.cardBg,
                        border: `3px solid ${effectiveGazeActive ? THEME.success : THEME.border}`,
                        color: effectiveGazeActive ? THEME.success : THEME.textSub,
                        boxShadow: effectiveGazeActive
                            ? '0 6px 18px rgba(0,0,0,0.18)'
                            : '0 6px 18px rgba(0,0,0,0.16)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        transition: 'all 200ms ease',
                        fontFamily: UI_FONT,
                    }}
                >
                    <div style={{
                        width: 'clamp(9px, 1.3vh, 14px)',
                        height: 'clamp(9px, 1.3vh, 14px)',
                        borderRadius: '50%',
                        backgroundColor: effectiveGazeActive ? THEME.success : THEME.textDim,
                        marginBottom: '2px',
                    }} />
                    <span style={{ fontSize: 'clamp(11px, 1.4vh, 15px)', fontWeight: 700, lineHeight: 1 }}>
                        {effectiveGazeActive ? 'GAZE' : 'ENABLE'}
                    </span>
                    <span style={{ fontSize: 'clamp(11px, 1.4vh, 15px)', fontWeight: 700, lineHeight: 1 }}>
                        {effectiveGazeActive ? 'ON' : 'GAZE'}
                    </span>
                </GazeButton>

                {/* ── RIGHT WING: VIEW SUMMARY + CONFIRM? + SKIP ── */}
                <div style={{
                    flex: 1,
                    display: 'flex',
                    justifyContent: 'flex-start',
                    alignItems: 'center',
                    paddingLeft: 'clamp(30px, 4vw, 60px)',
                    gap: 'clamp(12px, 1.5vw, 24px)',
                }}>
                    <GazeButton
                        id="view-summary"
                        onClick={() => setShowSummary(true)}
                        gazeEnabled={effectiveGazeActive}
                        gazeEnabledTimestamp={effectiveGazeTimestamp}
                        isDarkMode={isDarkMode}
                        style={{
                            padding: 'clamp(10px, 1.4vh, 16px) clamp(20px, 2.5vw, 36px)',
                            background: 'rgba(100, 181, 246, 0.08)',
                            border: `2px solid ${THEME.accent}40`,
                            borderRadius: '14px',
                            color: THEME.accent,
                            fontSize: 'clamp(15px, 1.9vh, 21px)',
                            fontWeight: 700,
                            minHeight: 'clamp(50px, 6.5vh, 68px)',
                            minWidth: 'clamp(130px, 13vw, 185px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        VIEW SUMMARY
                    </GazeButton>

                    {Object.keys(answers).filter(k => answers[k] && answers[k] !== 'SKIPPED').length >= 5 && (
                        <GazeButton
                            id="gen-fp-survey"
                            onClick={handleGenerateFromSurvey}
                            gazeEnabled={effectiveGazeActive}
                            gazeEnabledTimestamp={effectiveGazeTimestamp}
                            isDarkMode={isDarkMode}
                            style={{
                                padding: 'clamp(10px, 1.4vh, 16px) clamp(16px, 2vw, 28px)',
                                background: 'rgba(100, 181, 246, 0.12)',
                                border: '2px solid rgba(100, 181, 246, 0.5)',
                                borderRadius: '14px',
                                color: '#64B5F6',
                                fontSize: 'clamp(13px, 1.6vh, 18px)',
                                fontWeight: 700,
                                minHeight: 'clamp(50px, 6.5vh, 68px)',
                                minWidth: 'clamp(140px, 14vw, 200px)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
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
                            gazeEnabledTimestamp={effectiveGazeTimestamp}
                            isDarkMode={isDarkMode}
                            style={{
                                padding: 'clamp(10px, 1.4vh, 16px) clamp(20px, 2.5vw, 36px)',
                                background: THEME.accent,
                                border: 'none',
                                borderRadius: '14px',
                                color: '#FFFFFF',
                                fontSize: 'clamp(15px, 1.9vh, 21px)',
                                fontWeight: 700,
                                minHeight: 'clamp(50px, 6.5vh, 68px)',
                                minWidth: 'clamp(120px, 12vw, 170px)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            {'\u2713 CONFIRM'}
                        </GazeButton>
                    )}

                    <GazeButton
                        id="nav-skip"
                        onClick={handleSkip}
                        gazeEnabled={effectiveGazeActive}
                        gazeEnabledTimestamp={effectiveGazeTimestamp}
                        isDarkMode={isDarkMode}
                        style={{
                            padding: 'clamp(10px, 1.4vh, 16px) clamp(20px, 2.5vw, 36px)',
                            background: 'rgba(245, 158, 11, 0.06)',
                            border: '2px solid rgba(245, 158, 11, 0.25)',
                            borderRadius: '14px',
                            color: THEME.warning,
                            fontSize: 'clamp(15px, 1.9vh, 21px)',
                            fontWeight: 700,
                            minHeight: 'clamp(50px, 6.5vh, 68px)',
                            minWidth: 'clamp(110px, 11vw, 155px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
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
                    background: 'rgba(0,0,0,0.84)',
                }}>
                    <div style={{
                        background: THEME.panelBg,
                        border: `1px solid ${THEME.border}`, borderRadius: '20px',
                        width: '92%', maxWidth: '850px', maxHeight: '88vh',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.24)',
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            padding: 'clamp(16px, 2.2vh, 24px) clamp(20px, 2.5vw, 32px)',
                            borderBottom: '1px solid rgba(100,116,139,0.15)', flexShrink: 0,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <h2 style={{ color: THEME.textMain, fontSize: 'clamp(20px, 2.8vh, 30px)', fontWeight: 700, margin: 0 }}>
                                Design Survey Summary
                            </h2>
                            <div style={{ display: 'flex', gap: 'clamp(8px, 1vw, 16px)' }}>
                                <GazeButton id="save-summary" onClick={handleSaveProgress}
                                    gazeEnabled={true} alwaysActive={true} gazeEnabledTimestamp={0} isDarkMode={true}
                                    style={{
                                        padding: 'clamp(10px, 1.4vh, 16px) clamp(18px, 2.2vw, 30px)',
                                        background: 'rgba(100, 181, 246, 0.12)',
                                        border: `2px solid ${THEME.accent}50`,
                                        borderRadius: '12px',
                                        color: THEME.accent,
                                        fontSize: 'clamp(14px, 1.8vh, 19px)', fontWeight: 700,
                                    }}>
                                    SAVE PROGRESS
                                </GazeButton>
                                <GazeButton id="close-summary" onClick={() => setShowSummary(false)}
                                    gazeEnabled={true} alwaysActive={true} gazeEnabledTimestamp={0} isDarkMode={true}
                                    style={{
                                        padding: 'clamp(10px, 1.4vh, 16px) clamp(18px, 2.2vw, 30px)',
                                        background: THEME.accent, color: '#FFF', borderRadius: '12px',
                                        fontSize: 'clamp(14px, 1.8vh, 19px)', fontWeight: 700, border: 'none',
                                    }}>
                                    CLOSE
                                </GazeButton>
                            </div>
                        </div>
                        {/* Modal Body */}
                        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                            <SummaryPanel answers={answers} questions={SURVEY_QUESTIONS} currentPhase={currentPhaseId} />
                        </div>
                    </div>
                </div>
            )}

            {/* ════ SAVE/GENERATE MODAL ════ */}
            {showModal && <SaveConfirmModal mode={showModal} onClose={handleModalClose} />}

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
