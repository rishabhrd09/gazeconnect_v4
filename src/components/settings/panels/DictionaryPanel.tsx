import React, { useState, useEffect, useCallback } from 'react';
import { useWS } from '../../../hooks/useWebSocket';
import { darkColors, lightColors, typography, spacing } from '../../../utils/design';
import GazeButton from '../../core/GazeButton';
import {
    DEFAULT_PREDICTION_TELEMETRY,
    PREDICTION_TELEMETRY_EVENT,
    PredictionTelemetrySnapshot,
    loadPredictionTelemetry,
    resetPredictionTelemetry,
} from '../../../utils/predictionTelemetry';

interface DictionaryPanelProps {
    isDarkMode: boolean;
}

type Tab = 'words' | 'abbreviations' | 'sentences';

// Chevron SVG — clean, minimal
const Chevron: React.FC<{ open: boolean; color?: string }> = ({ open, color = 'currentColor' }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ transition: 'transform 200ms ease', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>
        <polyline points="9 18 15 12 9 6" />
    </svg>
);

const DictionaryPanel: React.FC<DictionaryPanelProps> = ({ isDarkMode }) => {
    const ws = useWS();
    const c = isDarkMode ? darkColors : lightColors;
    const [activeTab, setActiveTab] = useState<Tab>('words');
    const [status, setStatus] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const [newWord, setNewWord] = useState('');
    const [customWords, setCustomWords] = useState<string[]>([]);
    const [wordCount, setWordCount] = useState(0);

    const [newAbbrev, setNewAbbrev] = useState('');
    const [newExpansion, setNewExpansion] = useState('');
    const [abbreviations, setAbbreviations] = useState<Record<string, string>>({});
    const [customAbbreviations, setCustomAbbreviations] = useState<Record<string, string>>({});
    const [abbrevFilter, setAbbrevFilter] = useState('');

    const [newSentence, setNewSentence] = useState('');
    const [sentenceHistory, setSentenceHistory] = useState<Array<{ text: string; count: number }>>([]);
    const [sentenceCount, setSentenceCount] = useState(0);

    const builtinData = ws.builtinData;
    const [showBuiltin, setShowBuiltin] = useState(false);
    const [showBuiltinSentences, setShowBuiltinSentences] = useState(false);
    const [wordFilter, setWordFilter] = useState('');
    const [openCategory, setOpenCategory] = useState<string | null>(null);
    const [predictionTelemetry, setPredictionTelemetry] = useState<PredictionTelemetrySnapshot>(() => loadPredictionTelemetry());

    const toast = useCallback((msg: string, type: 'success' | 'error') => {
        setStatus({ msg, type });
        setTimeout(() => setStatus(null), 3000);
    }, []);

    useEffect(() => { ws.getDictionaryData(); }, []);
    useEffect(() => { ws.getDictionaryData(); }, [activeTab]);
    useEffect(() => {
        const syncTelemetry = () => setPredictionTelemetry(loadPredictionTelemetry());
        syncTelemetry();
        window.addEventListener(PREDICTION_TELEMETRY_EVENT, syncTelemetry as EventListener);
        return () => window.removeEventListener(PREDICTION_TELEMETRY_EVENT, syncTelemetry as EventListener);
    }, []);

    const addWord = () => {
        const w = newWord.trim();
        if (!w || w.length < 2) { toast('Word must be at least 2 characters.', 'error'); return; }
        ws.addWord(w); setNewWord('');
        setCustomWords(p => [...p, w.toLowerCase()].sort());
        setWordCount(p => p + 1);
        toast(`Added "${w}"`, 'success');
    };
    const addAbbrev = () => {
        const a = newAbbrev.trim().toLowerCase(), e = newExpansion.trim();
        if (!a || !e || a.length < 2) { toast('Shortcut (2+ chars) and expansion required.', 'error'); return; }
        ws.addAbbreviation(a, e); setNewAbbrev(''); setNewExpansion('');
        setAbbreviations(p => ({ ...p, [a]: e }));
        setCustomAbbreviations(p => ({ ...p, [a]: e }));
        toast(`Added "${a}"`, 'success');
    };
    const removeAbbrev = (a: string) => {
        ws.removeAbbreviation(a);
        setCustomAbbreviations(p => { const n = { ...p }; delete n[a]; return n; });
        setAbbreviations(p => { const n = { ...p }; delete n[a]; return n; });
        toast(`Removed "${a}"`, 'success');
    };
    const addSentence = () => {
        const s = newSentence.trim();
        if (!s || s.length < 3) { toast('Sentence must be at least 3 characters.', 'error'); return; }
        ws.addSentenceTemplate(s); setNewSentence('');
        setSentenceHistory(p => [{ text: s, count: 5 }, ...p]);
        setSentenceCount(p => p + 1);
        toast('Sentence added.', 'success');
    };
    const resetPredictionStats = () => {
        setPredictionTelemetry(resetPredictionTelemetry());
        toast('Prediction insights reset.', 'success');
    };

    // --- Muted, professional color palette ---
    const accent = isDarkMode ? 'rgba(148, 180, 200, 0.85)' : 'rgba(71, 85, 105, 0.9)';
    const subtleBg = isDarkMode ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.015)';
    const subtleBorder = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    const mutedText = isDarkMode ? 'rgba(148, 163, 184, 0.8)' : 'rgba(100, 116, 139, 0.9)';

    const card: React.CSSProperties = {
        backgroundColor: subtleBg, borderRadius: '10px',
        border: `1px solid ${subtleBorder}`, overflow: 'hidden',
    };
    const cardHead: React.CSSProperties = {
        padding: '12px 16px', fontSize: '12px', fontWeight: 600, letterSpacing: '0.05em',
        textTransform: 'uppercase', color: mutedText,
        borderBottom: `1px solid ${subtleBorder}`,
    };
    const input: React.CSSProperties = {
        flex: 1, padding: '9px 13px', borderRadius: '7px',
        border: `1px solid ${subtleBorder}`,
        backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
        color: c.text.primary, fontSize: '13px', outline: 'none',
        transition: 'border-color 150ms',
    };
    const btnAdd: React.CSSProperties = {
        padding: '0 20px', backgroundColor: isDarkMode ? 'rgba(148, 180, 200, 0.15)' : 'rgba(71, 85, 105, 0.1)',
        color: isDarkMode ? 'rgba(180, 210, 230, 0.9)' : 'rgba(51, 65, 85, 0.9)',
        fontWeight: 600, borderRadius: '7px', border: `1px solid ${subtleBorder}`, fontSize: '12px',
    };
    const row: React.CSSProperties = {
        padding: '9px 16px', display: 'flex', alignItems: 'center', gap: '10px',
        borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.03)'}`,
        fontSize: '13px', color: c.text.primary, minHeight: '38px',
    };
    const pill = (bg: string, fg: string): React.CSSProperties => ({
        padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600,
        backgroundColor: bg, color: fg, whiteSpace: 'nowrap', letterSpacing: '0.02em',
    });
    const sectionBtn: React.CSSProperties = {
        padding: '12px 16px', borderRadius: '8px', width: '100%', textAlign: 'left',
        border: `1px solid ${subtleBorder}`, backgroundColor: subtleBg,
        color: c.text.primary, fontSize: '13px', fontWeight: 600, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '8px',
        transition: 'background-color 150ms',
    };

    const filteredAbbrevs = Object.entries(abbreviations)
        .filter(([k, v]) => !abbrevFilter || k.includes(abbrevFilter.toLowerCase()) || v.toLowerCase().includes(abbrevFilter.toLowerCase()))
        .sort((a, b) => a[0].localeCompare(b[0]));
    const totalPredictionAccepts = predictionTelemetry.wordAccepts
        + predictionTelemetry.sentenceAccepts
        + predictionTelemetry.ghostAccepts
        + predictionTelemetry.starterAccepts;
    const avgCharsSaved = totalPredictionAccepts > 0
        ? (predictionTelemetry.charsSaved / totalPredictionAccepts).toFixed(1)
        : '0.0';
    const lastUpdatedLabel = predictionTelemetry.lastUpdatedAt
        ? new Date(predictionTelemetry.lastUpdatedAt).toLocaleString()
        : 'No prediction accepts yet';

    const vocabCats = [
        { key: 'core_vocabulary', label: 'Core English', fg: isDarkMode ? '#8CB4C8' : '#4B7A8C', bg: isDarkMode ? 'rgba(140,180,200,0.1)' : 'rgba(75,122,140,0.08)' },
        { key: 'medical_vocabulary', label: 'Medical / ALS', fg: isDarkMode ? '#D4A574' : '#9A7046', bg: isDarkMode ? 'rgba(212,165,116,0.1)' : 'rgba(154,112,70,0.08)' },
        { key: 'patient_vocabulary', label: 'Papa', fg: isDarkMode ? '#B0A0D0' : '#7B6BA0', bg: isDarkMode ? 'rgba(176,160,208,0.1)' : 'rgba(123,107,160,0.08)' },
        { key: 'hindi_vocabulary', label: 'Hindi', fg: isDarkMode ? '#C89EB0' : '#9A6B80', bg: isDarkMode ? 'rgba(200,158,176,0.1)' : 'rgba(154,107,128,0.08)' },
        { key: 'hinglish_vocabulary', label: 'Hinglish', fg: isDarkMode ? '#9EA8D4' : '#6B74A0', bg: isDarkMode ? 'rgba(158,168,212,0.1)' : 'rgba(107,116,160,0.08)' },
        { key: 'cultural_vocabulary', label: 'Cultural', fg: isDarkMode ? '#88BEB0' : '#5A8A7C', bg: isDarkMode ? 'rgba(136,190,176,0.1)' : 'rgba(90,138,124,0.08)' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: c.text.primary, margin: 0, letterSpacing: '-0.01em' }}>
                    Dictionary & Shortcuts
                </h2>
                <p style={{ fontSize: '12px', color: mutedText, margin: '3px 0 0', lineHeight: 1.4 }}>
                    Manage your words, abbreviation shortcuts, and sentence templates.
                </p>
            </div>

            <div style={card}>
                <div style={{ ...cardHead, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                    <span>Prediction Insights</span>
                    <button onClick={resetPredictionStats} style={{
                        border: `1px solid ${subtleBorder}`,
                        backgroundColor: 'transparent',
                        color: mutedText,
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '5px 10px',
                        cursor: 'pointer',
                    }}>
                        Reset Stats
                    </button>
                </div>
                <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
                    {[
                        { label: 'Chars Saved', value: predictionTelemetry.charsSaved },
                        { label: 'Total Accepts', value: totalPredictionAccepts },
                        { label: 'Avg Saved / Accept', value: avgCharsSaved },
                        { label: 'Word Accepts', value: predictionTelemetry.wordAccepts },
                        { label: 'Sentence Accepts', value: predictionTelemetry.sentenceAccepts },
                        { label: 'Ghost Accepts', value: predictionTelemetry.ghostAccepts },
                    ].map(item => (
                        <div key={item.label} style={{
                            border: `1px solid ${subtleBorder}`,
                            borderRadius: '8px',
                            padding: '10px 12px',
                            backgroundColor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#FFFFFF',
                        }}>
                            <div style={{ fontSize: '11px', color: mutedText, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {item.label}
                            </div>
                            <div style={{ fontSize: '20px', fontWeight: 700, color: c.text.primary }}>
                                {item.value}
                            </div>
                        </div>
                    ))}
                </div>
                <div style={{
                    padding: '0 16px 14px',
                    color: mutedText,
                    fontSize: '11px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap',
                }}>
                    <span>Starter accepts: {predictionTelemetry.starterAccepts}</span>
                    <span>Last updated: {lastUpdatedLabel}</span>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '1px', backgroundColor: subtleBorder, borderRadius: '8px', padding: '2px', overflow: 'hidden' }}>
                {([
                    { id: 'words' as Tab, label: 'Words' },
                    { id: 'abbreviations' as Tab, label: `Shortcuts (${Object.keys(abbreviations).length})` },
                    { id: 'sentences' as Tab, label: 'Sentences' },
                ]).map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                        flex: 1, padding: '8px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                        backgroundColor: activeTab === t.id
                            ? (isDarkMode ? 'rgba(148, 180, 200, 0.15)' : 'rgba(71, 85, 105, 0.1)')
                            : 'transparent',
                        color: activeTab === t.id ? c.text.primary : mutedText,
                        fontWeight: activeTab === t.id ? 700 : 500, fontSize: '12px',
                        transition: 'all 150ms',
                    }}>{t.label}</button>
                ))}
            </div>

            {status && (
                <div style={{
                    padding: '7px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
                    backgroundColor: status.type === 'success' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                    color: status.type === 'success' ? (isDarkMode ? '#6EE7B7' : '#059669') : (isDarkMode ? '#FCA5A5' : '#DC2626'),
                    border: `1px solid ${status.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}`,
                }}>{status.msg}</div>
            )}

            {/* ===== WORDS ===== */}
            {activeTab === 'words' && (
                <>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input type="text" value={newWord} onChange={e => setNewWord(e.target.value)}
                            placeholder="Add a new word..." onKeyDown={e => e.key === 'Enter' && addWord()} style={input} />
                        <GazeButton id="add-word" onClick={addWord} isDarkMode={isDarkMode} gazeEnabled={false}
                            dwellCategory="settingsButton" style={btnAdd}>Add Word</GazeButton>
                    </div>

                    {customWords.length > 0 && (
                        <div style={card}>
                            <div style={cardHead}>Your Words ({customWords.length})</div>
                            <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                                {customWords.map(w => (
                                    <div key={w} style={row}>
                                        <span style={{ flex: 1 }}>{w}</span>
                                        <span style={pill(isDarkMode ? 'rgba(140,180,200,0.1)' : 'rgba(75,122,140,0.08)', isDarkMode ? '#8CB4C8' : '#4B7A8C')}>added</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <button onClick={() => { if (!showBuiltin && !builtinData) ws.getBuiltinData(); setShowBuiltin(!showBuiltin); }} style={sectionBtn}>
                        <Chevron open={showBuiltin} color={mutedText} />
                        <span style={{ flex: 1 }}>Built-in Vocabulary</span>
                        {builtinData && <span style={{ color: mutedText, fontSize: '11px', fontWeight: 400 }}>
                            {vocabCats.reduce((s, cat) => s + (builtinData[cat.key]?.length || 0), 0)} words
                        </span>}
                    </button>

                    {showBuiltin && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <input type="text" value={wordFilter} onChange={e => setWordFilter(e.target.value)}
                                placeholder="Search across all categories..." style={{ ...input, flex: 'none' }} />
                            {builtinData ? vocabCats.map(cat => {
                                const words: string[] = builtinData[cat.key] || [];
                                const filtered = wordFilter ? words.filter(w => w.toLowerCase().includes(wordFilter.toLowerCase())) : words;
                                const isOpen = openCategory === cat.key;
                                return (
                                    <div key={cat.key} style={card}>
                                        <button onClick={() => setOpenCategory(isOpen ? null : cat.key)} style={{
                                            ...cardHead, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                                            width: '100%', border: 'none', backgroundColor: 'transparent', textAlign: 'left',
                                        }}>
                                            <Chevron open={isOpen} color={cat.fg} />
                                            <span style={{ flex: 1 }}>{cat.label}</span>
                                            <span style={pill(cat.bg, cat.fg)}>
                                                {wordFilter ? `${filtered.length}/${words.length}` : words.length}
                                            </span>
                                        </button>
                                        {isOpen && (
                                            <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                                                {filtered.length === 0 ? (
                                                    <div style={{ ...row, color: mutedText, fontStyle: 'italic' }}>{wordFilter ? 'No matches.' : 'Empty.'}</div>
                                                ) : filtered.map((w, i) => (
                                                    <div key={`${w}-${i}`} style={row}><span style={{ flex: 1 }}>{w}</span></div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            }) : <div style={{ color: mutedText, fontSize: '12px', padding: '16px', textAlign: 'center' }}>Loading...</div>}
                        </div>
                    )}
                </>
            )}

            {/* ===== ABBREVIATIONS ===== */}
            {activeTab === 'abbreviations' && (
                <>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <input type="text" value={newAbbrev} onChange={e => setNewAbbrev(e.target.value)}
                            placeholder="iww" maxLength={8}
                            style={{ ...input, flex: '0 0 90px', textAlign: 'center', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '1px' }} />
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={mutedText} strokeWidth="2" strokeLinecap="round">
                            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                        </svg>
                        <input type="text" value={newExpansion} onChange={e => setNewExpansion(e.target.value)}
                            placeholder="I want warm water" onKeyDown={e => e.key === 'Enter' && addAbbrev()} style={input} />
                        <GazeButton id="add-abbrev" onClick={addAbbrev} isDarkMode={isDarkMode} gazeEnabled={false}
                            dwellCategory="settingsButton" style={btnAdd}>Add</GazeButton>
                    </div>
                    <input type="text" value={abbrevFilter} onChange={e => setAbbrevFilter(e.target.value)}
                        placeholder="Search shortcuts..." style={{ ...input, flex: 'none' }} />
                    <div style={card}>
                        <div style={cardHead}>All Shortcuts ({filteredAbbrevs.length})</div>
                        <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
                            {filteredAbbrevs.map(([a, e]) => {
                                const isCustom = a in customAbbreviations;
                                return (
                                    <div key={a} style={row}>
                                        <span style={{ fontWeight: 700, color: accent, minWidth: '50px', fontFamily: 'monospace', fontSize: '13px' }}>{a}</span>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}
                                            strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                                            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                                        </svg>
                                        <span style={{ flex: 1, fontSize: '13px' }}>{e}</span>
                                        {isCustom ? (
                                            <>
                                                <span style={pill(isDarkMode ? 'rgba(212,165,116,0.12)' : 'rgba(154,112,70,0.08)', isDarkMode ? '#D4A574' : '#9A7046')}>custom</span>
                                                <button onClick={() => removeAbbrev(a)} style={{
                                                    background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px',
                                                    color: isDarkMode ? 'rgba(252,165,165,0.7)' : 'rgba(220,38,38,0.6)', fontSize: '14px',
                                                }}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                                    </svg>
                                                </button>
                                            </>
                                        ) : <span style={pill(isDarkMode ? 'rgba(140,180,200,0.08)' : 'rgba(75,122,140,0.06)', isDarkMode ? 'rgba(140,180,200,0.6)' : 'rgba(75,122,140,0.5)')}>built-in</span>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

            {/* ===== SENTENCES ===== */}
            {activeTab === 'sentences' && (
                <>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input type="text" value={newSentence} onChange={e => setNewSentence(e.target.value)}
                            placeholder="Add a sentence (e.g. I want warm water)"
                            onKeyDown={e => e.key === 'Enter' && addSentence()} style={input} />
                        <GazeButton id="add-sentence" onClick={addSentence} isDarkMode={isDarkMode} gazeEnabled={false}
                            dwellCategory="settingsButton" style={btnAdd}>Add</GazeButton>
                    </div>

                    {sentenceHistory.length > 0 && (
                        <div style={card}>
                            <div style={cardHead}>Learned Sentences ({sentenceCount})</div>
                            <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                                {sentenceHistory.map((item, i) => (
                                    <div key={`${item.text}-${i}`} style={row}>
                                        <span style={{ flex: 1 }}>{item.text}</span>
                                        <span style={pill(isDarkMode ? 'rgba(140,180,200,0.08)' : 'rgba(75,122,140,0.06)', isDarkMode ? 'rgba(140,180,200,0.6)' : 'rgba(75,122,140,0.5)')}>{item.count}x</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <button onClick={() => { if (!showBuiltinSentences && !builtinData) ws.getBuiltinData(); setShowBuiltinSentences(!showBuiltinSentences); }} style={sectionBtn}>
                        <Chevron open={showBuiltinSentences} color={mutedText} />
                        <span style={{ flex: 1 }}>Built-in Sentence Templates</span>
                        {builtinData?.sentence_templates && <span style={{ color: mutedText, fontSize: '11px', fontWeight: 400 }}>
                            {builtinData.template_count} sentences
                        </span>}
                    </button>

                    {showBuiltinSentences && builtinData?.sentence_templates && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {builtinData.sentence_templates.map((tmpl: any, i: number) => {
                                const isOpen = openCategory === `t-${i}`;
                                return (
                                    <div key={i} style={card}>
                                        <button onClick={() => setOpenCategory(isOpen ? null : `t-${i}`)} style={{
                                            ...cardHead, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                                            width: '100%', border: 'none', backgroundColor: 'transparent', textAlign: 'left',
                                        }}>
                                            <Chevron open={isOpen} color={isDarkMode ? '#D4A574' : '#9A7046'} />
                                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: accent }}>"{tmpl.prefix}"</span>
                                            <span style={{ flex: 1, fontWeight: 400, textTransform: 'none', color: mutedText }}>{tmpl.category}</span>
                                            <span style={pill(isDarkMode ? 'rgba(212,165,116,0.1)' : 'rgba(154,112,70,0.06)', isDarkMode ? '#D4A574' : '#9A7046')}>{tmpl.sentences.length}</span>
                                        </button>
                                        {isOpen && (
                                            <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                                                {tmpl.sentences.map((s: string, j: number) => (
                                                    <div key={j} style={row}><span style={{ flex: 1 }}>{s}</span></div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {showBuiltinSentences && !builtinData?.sentence_templates && (
                        <div style={{ color: mutedText, fontSize: '12px', padding: '16px', textAlign: 'center' }}>Loading...</div>
                    )}

                    {showBuiltinSentences && builtinData?.training_corpus && (
                        <div style={card}>
                            <div style={cardHead}>Training Corpus ({builtinData.training_corpus.length} English + {builtinData.hindi_corpus?.length || 0} Hindi)</div>
                            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                {builtinData.training_corpus.map((s: string, i: number) => (
                                    <div key={i} style={{ ...row, borderLeft: `2px solid ${isDarkMode ? 'rgba(140,180,200,0.15)' : 'rgba(75,122,140,0.12)'}`, paddingLeft: '14px' }}>{s}</div>
                                ))}
                                {builtinData.hindi_corpus?.map((s: string, i: number) => (
                                    <div key={`h-${i}`} style={{ ...row, borderLeft: `2px solid ${isDarkMode ? 'rgba(200,158,176,0.15)' : 'rgba(154,107,128,0.12)'}`, paddingLeft: '14px' }}>{s}</div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default DictionaryPanel;
