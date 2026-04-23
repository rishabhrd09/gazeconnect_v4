/**
 * WebBrowsingScreen v3.6 — Real gaze cursor inside BrowserView, bigger buttons
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import GazeButton from '../components/core/GazeButton';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { screenThemes } from '../utils/design';
import { useGazeControl } from '../components/core/GazeControlToggle';
import { useWS } from '../hooks/useWebSocket';
import { useGazeBrowser } from '../hooks/useGazeBrowser';
import { useRealGaze } from '../contexts/RealGazeContext';
import { useTheme } from '../contexts/ThemeContext';
import { WhatsAppIcon } from '../components/icons/Icons';

const T = screenThemes.web;
const GAP = 'clamp(24px, 3vh, 40px)'; // Even larger gap
const CR = '24px';
const CBG = 'linear-gradient(145deg,rgba(50,62,75,0.65),rgba(40,52,65,0.55))';
const CB = '2px solid rgba(90,110,130,0.45)';
const GL = 'rgba(30,45,60,0.65)';
const TL = '#2DD4BF';
const AC = '#58A6FF';

const cs: React.CSSProperties = {
    background: CBG, border: CB, borderRadius: CR, boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
    transition: 'all 0.2s ease', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', cursor: 'pointer',
};

// High-visibility large pill for categories
const pill = (on: boolean, ac = AC): React.CSSProperties => ({
    padding: 'clamp(20px, 3vh, 32px) clamp(32px, 4vw, 50px)', // Massive touch target
    fontSize: 'clamp(22px, 2.8vh, 30px)', fontWeight: on ? 700 : 600, fontFamily: "'Inter',sans-serif",
    color: on ? '#fff' : 'rgba(255,255,255,0.7)', background: on ? `${ac}25` : GL,
    border: on ? `3px solid ${ac}60` : '3px solid rgba(90,110,130,0.3)', borderRadius: '28px',
    whiteSpace: 'nowrap' as const, minHeight: 'clamp(80px, 10vh, 110px)', width: 'auto', // Override fixed size
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', flexShrink: 0
});
const cb: React.CSSProperties = {
    padding: 'clamp(20px, 2.6vh, 30px) clamp(30px, 4vw, 48px)', // Generous padding
    fontSize: 'clamp(19px, 2.4vh, 26px)', fontWeight: 600, fontFamily: "'Inter',sans-serif",
    color: '#fff', background: GL, border: '2px solid rgba(90,110,130,0.3)', borderRadius: '20px',
    minHeight: 'clamp(70px, 9vh, 100px)', width: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
};

const BackBtn = ({ onClick, ige, ts, toggleGaze, label = "← Home Grid", showHome = true, centerGaze = false }: { onClick: () => void; ige: boolean; ts: number; toggleGaze: () => void; label?: string; showHome?: boolean; centerGaze?: boolean }) => (
    <div style={{ position: 'relative', width: '100%', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '60px', padding: centerGaze ? '12px 0 24px 0' : '24px 0', flexShrink: 0 }}>
        {showHome && !centerGaze && (
            <GazeButton id="nav-back" onClick={onClick} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: 'clamp(64px, 8.5vh, 90px)', padding: '0 clamp(40px, 6vw, 80px)',
                    fontFamily: "'Outfit', system-ui", fontWeight: 700, fontSize: 'clamp(20px, 2.6vh, 28px)',
                    color: 'rgba(255, 255, 255, 0.95)', background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '24px',
                    backdropFilter: 'blur(16px)', letterSpacing: '0.5px',
                    minWidth: 'clamp(260px, 30vw, 380px)', cursor: 'pointer', transition: 'all 0.2s ease', gap: '12px'
                }}>
                {label}
            </GazeButton>
        )}
        <button
            id="gaze-toggle-web-hub"
            onClick={toggleGaze}
            className="gaze-button gaze-toggle"
            data-gaze="true"
            data-gaze-toggle="true"
            data-gaze-always="true"
            style={{
                padding: '0',
                backgroundColor: ige ? 'rgba(45, 212, 191, 0.25)' : 'rgba(255, 255, 255, 0.15)',
                border: `3px solid ${ige ? '#2DD4BF' : 'rgba(255, 255, 255, 0.6)'}`,
                borderRadius: '50%',
                color: ige ? '#2DD4BF' : '#ffffff',
                width: centerGaze ? 'clamp(90px, 12vh, 120px)' : 'clamp(75px, 10vh, 100px)',
                height: centerGaze ? 'clamp(90px, 12vh, 120px)' : 'clamp(75px, 10vh, 100px)',
                boxShadow: ige ? '0 0 20px rgba(45,212,191,0.3)' : '0 4px 12px rgba(0,0,0,0.3)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 200ms ease',
                backdropFilter: 'blur(16px)',
            }}
        >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{
                    width: centerGaze ? 'clamp(42px, 6vh, 60px)' : 'clamp(36px, 4.5vh, 48px)',
                    height: centerGaze ? 'clamp(42px, 6vh, 60px)' : 'clamp(36px, 4.5vh, 48px)',
                    transition: 'all 200ms ease'
                }}
            >
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="4" fill={ige ? "currentColor" : "none"} />
            </svg>
        </button>
    </div>
);

// YouTube data — verified working video IDs (searched Feb 2026)
const YT_CATS = [
    {
        id: 'bhajans', label: '🙏 Bhajans', videos: [
            { id: 'xTxo6e8R7ZQ', title: 'Hanuman Chalisa', ch: 'T-Series' }, { id: 'pynPH5wEDM8', title: 'Gayatri Mantra 108', ch: 'T-Series' },
            { id: 'B35qI-z7cJM', title: 'Om Jai Jagdish Hare', ch: 'T-Series' }, { id: 'u3G4v6jXbZ8', title: 'Hare Krishna', ch: 'Madhura' },
            { id: '3-X5h9_L2q4', title: 'Shiv Tandav', ch: 'T-Series' }, { id: '9vMh9f3P6gY', title: 'Ganesh Aarti', ch: 'T-Series' },
        ]
    },
    {
        id: 'old_songs', label: '🎵 Old Songs', videos: [
            { id: 'HAu2j46f7js', title: 'Evergreen Hits', ch: 'Bollywood' }, { id: 'B9NqJ6qY9c', title: 'Kishore Kumar Hits', ch: 'Saregama' },
            { id: 'mMjM5F5g4u8', title: 'Lata Mangeshkar', ch: 'Saregama' }, { id: 'X55p5rQL3s0', title: 'Mohd Rafi Hits', ch: 'Saregama' },
            { id: 'a5p8_2F1c0', title: 'Mukesh Best Songs', ch: 'Saregama' }, { id: 'j6_8-6r8_g', title: 'Asha Bhosle Hits', ch: 'Saregama' },
        ]
    },
    {
        id: 'nature', label: '🌿 Nature', videos: [
            { id: 'W9f9xFTfNkg', title: 'Gentle Rain 8H', ch: 'Relaxed Guy' }, { id: 'q76bMs-NwRk', title: 'Heavy Rain 10H', ch: 'Relaxed Guy' },
            { id: '7JyE47-Ykjo', title: 'Night Rain', ch: 'Relaxed Guy' }, { id: 'lFcSrYw-ARY', title: 'Nature Sounds', ch: 'Calm' },
            { id: 'hlWiI4xAXKY', title: 'Ocean Waves', ch: 'Relaxation' }, { id: 'CjB_oVeq8Lo', title: 'Forest Ambience', ch: 'Nature' },
        ]
    },
    {
        id: 'devotional', label: '🕉️ Devotional', videos: [
            { id: 'xTxo6e8R7ZQ', title: 'Hanuman Chalisa', ch: 'T-Series' }, { id: 'pynPH5wEDM8', title: 'Gayatri Mantra', ch: 'T-Series' },
            { id: '3-X5h9_L2q4', title: 'Shiv Tandav', ch: 'T-Series' }, { id: 'B35qI-z7cJM', title: 'Vishnu Aarti', ch: 'T-Series' },
            { id: '9vMh9f3P6gY', title: 'Ganesh Aarti', ch: 'T-Series' }, { id: 'u3G4v6jXbZ8', title: 'Krishna Bhajans', ch: 'Madhura' },
        ]
    },

    {
        id: 'news_hindi', label: '📰 News Hindi', videos: [
            { id: 'xTxo6e8R7ZQ', title: 'Hindi Morning Bulletin', ch: 'News Hindi' }, { id: 'pynPH5wEDM8', title: 'Headlines Today', ch: 'News Hindi' },
            { id: '3-X5h9_L2q4', title: 'National Updates', ch: 'News Hindi' }, { id: 'B35qI-z7cJM', title: 'Business Updates', ch: 'News Hindi' },
            { id: '9vMh9f3P6gY', title: 'Sports News', ch: 'News Hindi' }, { id: 'u3G4v6jXbZ8', title: 'Evening Wrap', ch: 'News Hindi' },
        ]
    },
    {
        id: 'relax', label: '🧘 Relax', videos: [
            { id: 'W9f9xFTfNkg', title: 'Light Rain Relaxation', ch: 'Calm' }, { id: 'q76bMs-NwRk', title: 'Sleep Sounds', ch: 'Calm' },
            { id: '7JyE47-Ykjo', title: 'Soft Piano Ambience', ch: 'Calm' }, { id: 'hlWiI4xAXKY', title: 'Ocean Calm Waves', ch: 'Calm' },
            { id: 'CjB_oVeq8Lo', title: 'Forest Morning', ch: 'Calm' }, { id: 'lFcSrYw-ARY', title: 'Relaxing Nature Mix', ch: 'Calm' },
        ]
    },
];

const isValidYouTubeId = (id?: string) => !!id && /^[A-Za-z0-9_-]{11}$/.test(id);
const resolveYouTubeUrl = (video: any): string => {
    if (video?.url && typeof video.url === 'string') return video.url;
    const query = encodeURIComponent(`${video?.title || 'YouTube video'} ${video?.ch || ''}`.trim());
    if (video?.strictId === true && isValidYouTubeId(video?.id)) {
        return `https://www.youtube.com/watch?v=${video.id}&autoplay=1`;
    }
    return `https://www.youtube.com/results?search_query=${query}`;
};

type QuickTopicMode = 'web' | 'card';
interface QuickTopic {
    id: string;
    icon: string;
    label: string;
    url: string;
    mode: QuickTopicMode;
}

const QUICK_TOPICS: QuickTopic[] = [
    { id: 'india_news', icon: '📰', label: 'India News', url: 'https://news.google.com/search?q=India', mode: 'web' },
    { id: 'weather_indore', icon: '🌦️', label: 'Weather Indore', url: 'https://www.google.com/search?q=weather+Indore', mode: 'card' },
    { id: 'cricket_score', icon: '🏏', label: 'Cricket Score', url: 'https://www.google.com/search?q=live+cricket+score', mode: 'card' },
    { id: 'gold_price', icon: '💰', label: 'Gold Price', url: 'https://www.google.com/search?q=gold+price+today+India', mode: 'card' },
    { id: 'stock_market', icon: '📈', label: 'Stock Market', url: 'https://www.google.com/search?q=Sensex+Nifty+today', mode: 'web' },
    { id: 'als_research', icon: '🧬', label: 'ALS Research', url: 'https://www.google.com/search?q=ALS+research+latest', mode: 'web' },
    { id: 'pm_modi', icon: '🏛️', label: 'PM Modi', url: 'https://www.google.com/search?q=PM+Modi+latest+news', mode: 'web' },
    { id: 'indore_news', icon: '📍', label: 'Indore News', url: 'https://www.google.com/search?q=Indore+news+today', mode: 'web' },
];

type ViewState = 'grid' | 'news' | 'youtube' | 'knowledge' | 'search' | 'whatsapp' | 'social';

// ── NEWS PANEL ──
type NewsItem = {
    title: string;
    summary?: string;
    description?: string;
    source?: string;
    link?: string;
    relative_time?: string;
    content?: string;
};

const formatNewsAsReadableParagraphs = (rawText: string): string[] => {
    const cleaned = (rawText || '')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (!cleaned) return [];

    const byParagraph = cleaned
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);

    let blocks = byParagraph;
    if (blocks.length < 2) {
        const sentences = cleaned
            .split(/(?<=[.!?])\s+/)
            .map((s) => s.trim())
            .filter(Boolean);
        const grouped: string[] = [];
        for (let i = 0; i < sentences.length; i += 2) {
            grouped.push([sentences[i], sentences[i + 1]].filter(Boolean).join(' '));
        }
        blocks = grouped;
    }

    const deduped: string[] = [];
    for (const block of blocks) {
        if (deduped.length && deduped[deduped.length - 1].toLowerCase() === block.toLowerCase()) continue;
        deduped.push(block);
        if (deduped.length >= 18) break;
    }
    return deduped;
};

const NewsPanel = ({ ige, ts, onSpeak, goBack: _goBack, disableGaze, browser, gpRef, isNavHidden }: {
    ige: boolean;
    ts: number;
    onSpeak: (t: string) => void;
    goBack: () => void;
    disableGaze: () => void;
    browser: ReturnType<typeof useGazeBrowser>;
    gpRef: React.MutableRefObject<{ x: number; y: number }>;
    isNavHidden?: boolean;
}) => {
    const ws = useWS();
    const [cat, setCat] = useState('positive_india');
    const [sel, setSel] = useState<NewsItem | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [readerUrl, setReaderUrl] = useState('');
    const [readerLoading, setReaderLoading] = useState(false);
    const [readerData, setReaderData] = useState<any | null>(null);
    const [readerLiveMode, setReaderLiveMode] = useState(false);
    const [autoReadOn, setAutoReadOn] = useState(false);
    const [autoReadPaused, setAutoReadPaused] = useState(false);
    const [autoReadIndex, setAutoReadIndex] = useState(0);
    const [isCompactGrid, setIsCompactGrid] = useState(() =>
        typeof window !== 'undefined' ? (window.innerWidth < 1500 || window.innerHeight < 900) : false,
    );
    const scrollRef = useRef<HTMLDivElement>(null);
    const readerWebRef = useRef<HTMLDivElement>(null);
    const autoReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const cats = ws.newsCategories.length ? ws.newsCategories : [
        { id: 'top', label: 'Top Stories', icon: '⭐' }, { id: 'india', label: 'India', icon: '🇮🇳' },
        { id: 'world', label: 'World', icon: '🌍' }, { id: 'health', label: 'Health', icon: '💚' },
        { id: 'sports', label: 'Sports', icon: '🏏' }, { id: 'tech', label: 'Tech', icon: '💻' },
        { id: 'science', label: 'Science', icon: '🔬' },
    ];

    useEffect(() => {
        ws.getNewsCategories();
        // The first fetch will be triggered by the `cat` dependency useEffect below
    }, []);

    useEffect(() => {
        setIsLoading(true);
        setSel(null);
        setReaderUrl('');
        setReaderData(null);
        setReaderLoading(false);
        setReaderLiveMode(false);
        setAutoReadOn(false);
        setAutoReadPaused(false);
        setAutoReadIndex(0);
        ws.getNews(cat, 9);
    }, [cat]);

    useEffect(() => {
        setIsLoading(false);
    }, [ws.newsItems, ws.newsCached]);

    useEffect(() => {
        if (!ws.articleData || !readerUrl) return;
        if (ws.articleData.url === readerUrl) {
            setReaderData(ws.articleData);
            setReaderLoading(false);
        }
    }, [ws.articleData, readerUrl]);

    useEffect(() => {
        if (!readerLiveMode || !readerUrl) return;
        let cancelled = false;
        const raf = requestAnimationFrame(() => {
            if (cancelled || !readerWebRef.current) return;
            const r = readerWebRef.current.getBoundingClientRect();
            if (r.width > 50 && r.height > 50) {
                browser.openPage(readerUrl, {
                    x: Math.round(r.left),
                    y: Math.round(r.top),
                    width: Math.round(r.width),
                    height: Math.round(r.height),
                });
            }
        });
        return () => {
            cancelled = true;
            cancelAnimationFrame(raf);
        };
    }, [readerLiveMode, readerUrl, browser, isNavHidden]);

    useEffect(() => {
        if (!readerLiveMode) {
            browser.closePage();
        }
    }, [readerLiveMode, browser]);

    useEffect(() => {
        return () => {
            browser.closePage();
        };
    }, [browser]);

    useEffect(() => {
        if (autoReadTimerRef.current) {
            clearTimeout(autoReadTimerRef.current);
            autoReadTimerRef.current = null;
        }
        if (!autoReadOn || autoReadPaused || !ws.newsItems.length) return;

        const idx = autoReadIndex % ws.newsItems.length;
        const item = ws.newsItems[idx] as NewsItem;
        onSpeak(`${item.title}. ${item.summary || item.description || ''}`.trim());

        autoReadTimerRef.current = setTimeout(() => {
            setAutoReadIndex((prev) => prev + 1);
        }, 5000);

        return () => {
            if (autoReadTimerRef.current) {
                clearTimeout(autoReadTimerRef.current);
                autoReadTimerRef.current = null;
            }
        };
    }, [autoReadOn, autoReadPaused, autoReadIndex, ws.newsItems, onSpeak]);

    useEffect(() => {
        return () => {
            if (autoReadTimerRef.current) {
                clearTimeout(autoReadTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const handleResize = () => {
            setIsCompactGrid(window.innerWidth < 1500 || window.innerHeight < 900);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const startAutoRead = useCallback(() => {
        if (!ws.newsItems.length) return;
        setAutoReadOn(true);
        setAutoReadPaused(false);
        if (autoReadIndex >= ws.newsItems.length) {
            setAutoReadIndex(0);
        }
    }, [autoReadIndex, ws.newsItems.length]);

    const pauseAutoRead = useCallback(() => {
        setAutoReadPaused((prev) => !prev);
    }, []);

    const stopAutoRead = useCallback(() => {
        setAutoReadOn(false);
        setAutoReadPaused(false);
        setAutoReadIndex(0);
        ws.stopSpeaking();
    }, [ws.stopSpeaking]);

    const selectItem = useCallback((item: NewsItem) => {
        setSel(item);
        setReaderData(null);
        setReaderUrl('');
        setReaderLoading(false);
        onSpeak(`${item.title}. ${item.summary || item.description || ''}`.trim());
        disableGaze();
    }, [disableGaze, onSpeak]);

    const openReaderView = useCallback(() => {
        if (!sel?.link) return;
        setReaderUrl(sel.link);
        setReaderLoading(true);
        setReaderData(null);
        setReaderLiveMode(false);
        ws.fetchArticle(sel.link);
        disableGaze();
    }, [sel, ws.fetchArticle, disableGaze]);

    const openReaderFallbackWeb = useCallback(() => {
        if (!sel?.link) return;
        setReaderUrl(sel.link);
        setReaderLiveMode(true);
        disableGaze();
    }, [sel, disableGaze]);

    const cardCount = isCompactGrid ? 4 : 6;
    const visibleItems = ws.newsItems.slice(0, cardCount) as NewsItem[];
    const activeAutoReadIndex = ws.newsItems.length ? autoReadIndex % ws.newsItems.length : -1;
    const sidebarVisibleCount = 5;
    const sidebarItems = ws.newsItems.slice(0, sidebarVisibleCount) as NewsItem[];
    const sidebarSlots = Array.from({ length: sidebarVisibleCount }, (_, idx) => sidebarItems[idx] || null);
    const categoryIndex = Math.max(0, cats.findIndex((c: any) => c.id === cat));
    const currentCategory = cats[categoryIndex] || cats[0];
    const readerBodyRaw = readerData?.text || sel?.content || sel?.description || sel?.summary || '';
    const readableParagraphs = formatNewsAsReadableParagraphs(readerBodyRaw);

    if (sel) {
        return (
            <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                marginTop: 'clamp(95px, 12.5vh, 125px)', padding: 'clamp(16px, 2vh, 24px) clamp(20px, 3vw, 40px)',
                paddingBottom: 'clamp(20px, 2.5vh, 40px)'
            }}>
                <div style={{ display: 'flex', gap: 'clamp(16px,2.5vw,28px)', flexShrink: 0, flexWrap: 'wrap', marginBottom: 'clamp(12px,2vh,20px)' }}>
                    <GazeButton id="n-close" onClick={() => { setSel(null); setReaderData(null); setReaderUrl(''); setReaderLiveMode(false); browser.closePage(); }} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={{ ...cb, color: '#FF8A65', borderColor: 'rgba(255,138,101,0.4)', minWidth: 'clamp(130px,13vw,170px)' }}>✕ Close</GazeButton>
                    <GazeButton id="n-read" onClick={() => onSpeak(`${sel.title}. ${sel.summary || sel.description || ''}`)} gazeEnabled={ige}
                        gazeEnabledTimestamp={ts} isDarkMode style={{ ...cb, color: TL, borderColor: `${TL}50`, minWidth: 'clamp(130px,13vw,170px)' }}>🔊 Read</GazeButton>
                    <GazeButton id="n-reader" onClick={openReaderView} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={{ ...cb, color: '#90CAF9', borderColor: 'rgba(144,202,249,0.5)', minWidth: 'clamp(160px,16vw,220px)' }}>
                        📖 Read Full Story
                    </GazeButton>
                    <GazeButton id="n-reader-web" onClick={openReaderFallbackWeb} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={{ ...cb, color: '#A5D6A7', borderColor: 'rgba(165,214,167,0.5)', minWidth: 'clamp(150px,15vw,220px)' }}>
                        🌐 Open in Browser
                    </GazeButton>
                    {readerLiveMode && (
                        <>
                        <GazeButton id="n-bv-click" onClick={() => browser.clickAtGaze(gpRef.current.x, gpRef.current.y)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...cb, color: TL, borderColor: `${TL}50`, minWidth: 'clamp(130px,13vw,170px)' }}>👆 Click Here</GazeButton>
                        <GazeButton id="n-bv-up" onClick={() => browser.scrollUp()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...cb, minWidth: 'clamp(100px,10vw,140px)' }}>⬆ Up</GazeButton>
                        <GazeButton id="n-bv-down" onClick={() => browser.scrollDown()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...cb, minWidth: 'clamp(100px,10vw,140px)' }}>⬇ Down</GazeButton>
                        <GazeButton id="n-reader-text" onClick={() => { setReaderLiveMode(false); disableGaze(); }} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...cb, color: '#B3E5FC', borderColor: 'rgba(179,229,252,0.45)', minWidth: 'clamp(150px,15vw,220px)' }}>
                            📖 Reader View
                        </GazeButton>
                        </>
                    )}
                    <GazeButton id="n-stop" onClick={() => ws.stopSpeaking()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={{ ...cb, color: '#E53E3E', borderColor: 'rgba(229,62,62,0.4)', minWidth: 'clamp(110px,11vw,150px)' }}>⏹ Stop</GazeButton>
                    <GazeButton id="n-scroll" onClick={() => scrollRef.current?.scrollBy({ top: 280, behavior: 'smooth' })} gazeEnabled={ige}
                        gazeEnabledTimestamp={ts} isDarkMode style={{ ...cb, color: AC, borderColor: `${AC}50`, minWidth: 'clamp(130px,13vw,170px)' }}>⬇ Scroll</GazeButton>
                    {ws.newsCached && (
                        <div style={{
                            ...cb,
                            minHeight: 'clamp(54px,7vh,80px)',
                            color: '#7DD3FC',
                            borderColor: 'rgba(125,211,252,0.4)',
                            background: 'rgba(14,116,144,0.18)',
                        }}>📡 Cached</div>
                    )}
                </div>

                <div style={{ flex: 1, display: 'flex', gap: 'clamp(18px, 2.4vh, 28px)', overflow: 'hidden', minHeight: 0 }}>
                    <div style={{ width: 'clamp(340px, 29vw, 410px)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 1.6vh, 18px)', overflow: 'hidden' }}>
                        <div style={{
                            ...cs,
                            height: 'auto',
                            minHeight: 'clamp(70px, 8vh, 92px)',
                            alignItems: 'stretch',
                            justifyContent: 'center',
                            padding: 'clamp(12px,1.4vh,16px)',
                            background: 'linear-gradient(155deg, rgba(30,50,70,0.62), rgba(18,34,52,0.58))',
                        }}>
                            <div style={{ fontSize: 'clamp(12px,1.35vh,14px)', color: 'rgba(173,194,214,0.75)', marginBottom: '6px', letterSpacing: '0.02em' }}>
                                CURRENT CATEGORY
                            </div>
                            <div style={{ fontSize: 'clamp(18px,2vh,22px)', fontWeight: 700, color: '#E6EDF3' }}>
                                {currentCategory?.icon} {currentCategory?.label || 'Top Stories'}
                            </div>
                        </div>

                        <div style={{
                            flex: 1,
                            display: 'grid',
                            gridTemplateRows: `repeat(${sidebarVisibleCount}, minmax(0, 1fr))`,
                            gap: 'clamp(10px, 1.2vh, 14px)',
                            overflow: 'hidden',
                            minHeight: 0,
                        }}>
                            {sidebarSlots.map((it, i) => (
                                it ? (
                                    <GazeButton
                                        key={`${it.title}-${i}`}
                                        id={`ni-side-${i}`}
                                        onClick={() => selectItem(it)}
                                        gazeEnabled={ige}
                                        gazeEnabledTimestamp={ts}
                                        isDarkMode
                                        style={{
                                            ...cs,
                                            alignItems: 'flex-start',
                                            justifyContent: 'space-between',
                                            padding: 'clamp(14px,1.7vh,18px)',
                                            minHeight: 'clamp(96px, 10.5vh, 122px)',
                                            background: sel.title === it.title ? 'linear-gradient(155deg, rgba(63,109,158,0.32), rgba(28,48,75,0.42))' : 'linear-gradient(155deg, rgba(28,40,56,0.62), rgba(20,30,45,0.52))',
                                            border: sel.title === it.title ? '2px solid rgba(88,166,255,0.65)' : '1px solid rgba(90,110,130,0.38)',
                                        }}
                                    >
                                        <div style={{
                                            fontSize: 'clamp(15px,1.65vh,19px)',
                                            fontWeight: 600,
                                            color: '#E6EDF3',
                                            lineHeight: 1.35,
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical' as const,
                                            overflow: 'hidden',
                                            textAlign: 'left',
                                            width: '100%',
                                        }}>
                                            {it.title}
                                        </div>
                                        <div style={{ fontSize: 'clamp(11px,1.1vh,13px)', color: 'rgba(153,175,198,0.78)', marginTop: '8px' }}>
                                            {it.source || 'News'} • {it.relative_time || 'Recent'}
                                        </div>
                                    </GazeButton>
                                ) : (
                                    <div key={`ni-empty-${i}`} style={{
                                        minHeight: 'clamp(96px, 10.5vh, 122px)',
                                        borderRadius: '18px',
                                        border: '1px solid rgba(90,110,130,0.12)',
                                        background: 'rgba(20,30,44,0.22)',
                                    }} />
                                )
                            ))}
                        </div>
                    </div>

                    {readerLiveMode ? (
                        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                            {browser.edgeScrollDirection === 'up' && (
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 'clamp(20px,2.6vh,32px)', background: 'linear-gradient(to bottom, rgba(45,212,191,0.35), rgba(45,212,191,0))', zIndex: 5, pointerEvents: 'none', borderRadius: `${CR} ${CR} 0 0` }} />
                            )}
                            {browser.edgeScrollDirection === 'down' && (
                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 'clamp(20px,2.6vh,32px)', background: 'linear-gradient(to top, rgba(45,212,191,0.35), rgba(45,212,191,0))', zIndex: 5, pointerEvents: 'none', borderRadius: `0 0 ${CR} ${CR}` }} />
                            )}
                            <div ref={readerWebRef} style={{
                                width: '100%', height: '100%', borderRadius: CR, overflow: 'hidden', background: '#fff',
                                border: CB, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                            }}>
                                <div style={{
                                    width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#999', fontSize: '16px',
                                }}>
                                    {browser.loading ? '⏳ Loading article website...' : '🌐 Live article opened in BrowserView'}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div ref={scrollRef} style={{
                            ...cs, flex: 1, alignItems: 'stretch', justifyContent: 'flex-start',
                            padding: 'clamp(28px, 3.8vh, 48px)', overflow: 'auto', minHeight: 0,
                            background: 'linear-gradient(160deg, rgba(30,42,58,0.72), rgba(20,30,44,0.58))',
                        }}>
                            <div style={{ width: '100%', maxWidth: 'min(980px, 100%)', margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
                                <h2 style={{
                                    fontSize: 'clamp(30px, 4vh, 46px)',
                                    fontWeight: 700,
                                    color: '#E6EDF3',
                                    margin: 0,
                                    fontFamily: "'Outfit',sans-serif",
                                    lineHeight: 1.25,
                                    letterSpacing: '-0.015em',
                                }}>
                                    {readerData?.title || sel.title}
                                </h2>

                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'clamp(10px, 1vw, 14px)',
                                    flexWrap: 'wrap',
                                    marginTop: '14px',
                                    color: 'rgba(173,194,214,0.8)',
                                    fontSize: 'clamp(13px,1.35vh,16px)',
                                }}>
                                    <span>{sel.source || 'News'}</span>
                                    <span>•</span>
                                    <span>{sel.relative_time || 'Recent'}</span>
                                    {readerData?.cached && <span style={{ color: '#7DD3FC' }}>📡 Reader Cache</span>}
                                    {readerData?.fallback && <span style={{ color: '#FFCC80' }}>Fallback mode</span>}
                                </div>

                                <div style={{ height: 1, background: 'linear-gradient(to right, rgba(88,166,255,0.55), rgba(88,166,255,0.05))', margin: 'clamp(16px,2vh,22px) 0 clamp(20px,2.4vh,30px)' }} />

                                {readerLoading && (
                                    <div style={{ fontSize: 'clamp(20px,2.3vh,26px)', color: 'rgba(255,255,255,0.76)', lineHeight: 1.8 }}>
                                        Loading AAC Reader View...
                                    </div>
                                )}

                                {!readerLoading && (
                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 'clamp(16px, 2.1vh, 24px)',
                                        fontFamily: "'Merriweather', 'Georgia', serif",
                                    }}>
                                        {(readableParagraphs.length ? readableParagraphs : ['No article content available right now. Use Open in Browser.']).map((para, idx) => (
                                            <p key={`np-${idx}`} style={{
                                                margin: 0,
                                                fontSize: 'clamp(20px, 2.45vh, 30px)',
                                                lineHeight: 1.82,
                                                color: idx === 0 ? '#F3F8FF' : 'rgba(230,237,243,0.93)',
                                                background: idx === 0 ? 'rgba(88,166,255,0.08)' : 'transparent',
                                                border: idx === 0 ? '1px solid rgba(88,166,255,0.2)' : 'none',
                                                borderRadius: idx === 0 ? '14px' : 0,
                                                padding: idx === 0 ? 'clamp(16px,2vh,22px)' : 0,
                                            }}>
                                                {para}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', padding: GAP, gap: GAP, overflow: 'hidden',
            marginTop: 'clamp(130px, 16vh, 200px)', marginLeft: 'clamp(20px, 2.5vw, 40px)', marginRight: 'clamp(20px, 2.5vw, 40px)',
            paddingBottom: 'clamp(20px, 2.5vh, 40px)',
        }}>
            <div style={{
                display: 'flex', gap: 'clamp(16px, 2vw, 24px)', flexShrink: 0, flexWrap: 'wrap', overflow: 'visible',
                padding: 'clamp(16px, 2vh, 24px)', alignItems: 'center',
                background: 'rgba(15, 23, 42, 0.6)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)',
                marginBottom: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            }}>
                {cats.map((c: any) => (
                    <GazeButton key={c.id} id={`nc-${c.id}`} onClick={() => { setCat(c.id); disableGaze(); }}
                        gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode style={pill(cat === c.id)}>
                        {c.icon} {c.label}
                    </GazeButton>
                ))}
                <GazeButton id="n-ref" onClick={() => { setIsLoading(true); ws.refreshNews(cat, 9); }} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{ ...cb, minHeight: 'clamp(80px, 10vh, 110px)' }}>🔄 Refresh</GazeButton>
                <GazeButton id="n-auto" onClick={startAutoRead} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{ ...cb, minHeight: 'clamp(80px, 10vh, 110px)', color: '#A5D6A7', borderColor: 'rgba(165,214,167,0.45)' }}>▶ Auto-Read</GazeButton>
                <GazeButton id="n-pause" onClick={pauseAutoRead} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{ ...cb, minHeight: 'clamp(80px, 10vh, 110px)', color: '#F9E79F', borderColor: 'rgba(249,231,159,0.4)' }}>
                    {autoReadPaused ? '⏵ Resume' : '⏸ Pause'}
                </GazeButton>
                <GazeButton id="n-stop-auto" onClick={stopAutoRead} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{ ...cb, minHeight: 'clamp(80px, 10vh, 110px)', color: '#EF9A9A', borderColor: 'rgba(239,154,154,0.42)' }}>⏹ Stop</GazeButton>
                {ws.newsCached && (
                    <div style={{
                        ...cb,
                        minHeight: 'clamp(80px, 10vh, 110px)',
                        color: '#7DD3FC',
                        borderColor: 'rgba(125,211,252,0.4)',
                        background: 'rgba(14,116,144,0.18)',
                    }}>📡 Cached</div>
                )}
            </div>

            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gridTemplateRows: isCompactGrid ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: GAP, overflow: 'hidden', minHeight: 0 }}>
                {(visibleItems.length ? visibleItems : Array(cardCount).fill(null)).map((it: NewsItem | null, i: number) => (
                    <GazeButton key={it?.title || `ph-${i}`} id={`ni-${i}`} onClick={() => { if (it) selectItem(it); }}
                        gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={{
                            ...cs,
                            justifyContent: 'space-between',
                            padding: 'clamp(24px, 3.2vh, 36px)',
                            alignItems: 'flex-start',
                            opacity: it ? 1 : 0.35,
                            border: autoReadOn && i === activeAutoReadIndex ? `3px solid ${TL}` : CB,
                            boxShadow: autoReadOn && i === activeAutoReadIndex ? '0 0 18px rgba(45,212,191,0.45)' : cs.boxShadow,
                        }}>
                        <div style={{
                            fontSize: 'clamp(19px, 2.4vh, 30px)', fontWeight: 700, color: '#E6EDF3', lineHeight: 1.35,
                            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', flex: 1, textAlign: 'left',
                        }}>{it?.title || (isLoading ? 'Loading...' : 'No news available right now')}</div>
                        {it && (
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', width: '100%',
                                fontSize: 'clamp(15px, 1.7vh, 20px)', color: 'rgba(255,255,255,0.45)', marginTop: '16px',
                            }}>
                                <span style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 12px', borderRadius: '12px' }}>{it.source}</span>
                                <span>{it.relative_time}</span>
                            </div>
                        )}
                    </GazeButton>
                ))}
            </div>
        </div>
    );
};

// ── YOUTUBE PANEL ──
const YouTubePanel = ({ ige, ts, browser, gpRef, goBack: goGridBack, disableGaze, isNavHidden, onVideoActive }: {
    ige: boolean; ts: number; browser: ReturnType<typeof useGazeBrowser>;
    gpRef: React.MutableRefObject<{ x: number; y: number }>;
    goBack: () => void;
    disableGaze: () => void;
    isNavHidden?: boolean;
    onVideoActive?: (active: boolean) => void;
}) => {
    const [catId, setCatId] = useState('bhajans');
    const [playing, setPlaying] = useState<any>(null);
    const viewRef = useRef<HTMLDivElement>(null);
    const cat = YT_CATS.find(c => c.id === catId) || YT_CATS[0];

    useEffect(() => {
        onVideoActive?.(!!playing);
    }, [playing, onVideoActive]);

    // Open BrowserView AFTER player div renders — use requestAnimationFrame for paint
    useEffect(() => {
        if (!playing) return;
        let cancelled = false;
        const raf = requestAnimationFrame(() => {
            if (cancelled || !viewRef.current) return;
            const r = viewRef.current.getBoundingClientRect();
            if (r.width > 50 && r.height > 50) {
                const url = resolveYouTubeUrl(playing);
                browser.openPage(url, { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) });
            }
        });
        return () => { cancelled = true; cancelAnimationFrame(raf); };
    }, [playing]);

    const stop = useCallback(() => { browser.closePage(); setPlaying(null); }, [browser]);

    if (playing) return (
        <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', padding: 'clamp(12px,1.5vh,20px) GAP', gap: 'clamp(8px,1vh,12px)', overflow: 'hidden',
            marginTop: '0', transition: 'margin-top 0.3s ease',
            marginLeft: 'clamp(10px,1.5vw,20px)', marginRight: 'clamp(10px,1.5vw,20px)',
            paddingBottom: 'clamp(10px, 1.5vh, 20px)'
        }}>
            {/* ── PLAYER CONTROLS — big buttons spread across full width ── */}
            <div style={{ display: 'flex', gap: 'clamp(12px,1.5vw,20px)', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
                <GazeButton id="yt-close" onClick={stop} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{
                        ...cb, color: '#FF8A65', borderColor: 'rgba(255,138,101,0.4)', flex: 1.4, minWidth: 'clamp(150px,15vw,200px)',
                        fontSize: 'clamp(18px,2.2vh,24px)', padding: 'clamp(14px,1.8vh,22px) clamp(20px,2.5vw,30px)', minHeight: 'clamp(60px, 8vh, 85px)'
                    }}>✕ Close</GazeButton>
                <GazeButton id="yt-back" onClick={() => browser.goBack()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{
                        ...cb, color: AC, borderColor: `${AC}40`, flex: 1.4, minWidth: 'clamp(150px,15vw,200px)',
                        fontSize: 'clamp(18px,2.2vh,24px)', padding: 'clamp(14px,1.8vh,22px) clamp(20px,2.5vw,30px)', minHeight: 'clamp(60px, 8vh, 85px)'
                    }}>← Back</GazeButton>
                <GazeButton id="yt-click" onClick={() => browser.clickAtGaze(gpRef.current.x, gpRef.current.y)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{
                        ...cb, color: TL, borderColor: `${TL}50`, flex: 1.4, minWidth: 'clamp(150px,15vw,200px)',
                        fontSize: 'clamp(18px,2.2vh,24px)', padding: 'clamp(14px,1.8vh,22px) clamp(20px,2.5vw,30px)', minHeight: 'clamp(60px, 8vh, 85px)'
                    }}>👆 Click Here</GazeButton>
                {/* Merged Pause + Play — both sent 'k' (YouTube toggle shortcut) */}
                <GazeButton id="yt-playpause" onClick={() => browser.typeText('k')} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{
                        ...cb, color: TL, borderColor: `${TL}50`, flex: 1.4, minWidth: 'clamp(150px,15vw,200px)',
                        fontSize: 'clamp(18px,2.2vh,24px)', padding: 'clamp(14px,1.8vh,22px) clamp(20px,2.5vw,30px)', minHeight: 'clamp(60px, 8vh, 85px)'
                    }}>⏸▶ Pause/Play</GazeButton>

                <div style={{ flexBasis: 'clamp(80px, 10vw, 120px)', flexShrink: 0 }} /> {/* Safe Zone for Gaze Toggle */}

                <GazeButton id="yt-fs" onClick={() => browser.typeText('f')} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{
                        ...cb, flex: 1.4, minWidth: 'clamp(150px,15vw,200px)',
                        fontSize: 'clamp(18px,2.2vh,24px)', padding: 'clamp(14px,1.8vh,22px) clamp(20px,2.5vw,30px)', minHeight: 'clamp(60px, 8vh, 85px)'
                    }}>⛶ Full</GazeButton>
                <GazeButton id="yt-up" onClick={() => browser.scrollUp()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{
                        ...cb, flex: 1.4, minWidth: 'clamp(150px,15vw,200px)',
                        fontSize: 'clamp(18px,2.2vh,24px)', padding: 'clamp(14px,1.8vh,22px) clamp(20px,2.5vw,30px)', minHeight: 'clamp(60px, 8vh, 85px)'
                    }}>⬆ Up</GazeButton>
                <GazeButton id="yt-down" onClick={() => browser.scrollDown()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{
                        ...cb, flex: 1.4, minWidth: 'clamp(150px,15vw,200px)',
                        fontSize: 'clamp(18px,2.2vh,24px)', padding: 'clamp(14px,1.8vh,22px) clamp(20px,2.5vw,30px)', minHeight: 'clamp(60px, 8vh, 85px)'
                    }}>⬇ Down</GazeButton>
            </div>
            {/* Now playing label */}
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'clamp(16px,2vh,20px)', padding: '0 8px', flexShrink: 0, fontWeight: 600 }}>
                🎬 <b style={{ color: '#E6EDF3' }}>{playing.title}</b> — {playing.ch}
            </div>
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                {browser.edgeScrollDirection === 'up' && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 'clamp(20px,2.6vh,32px)', background: 'linear-gradient(to bottom, rgba(45,212,191,0.35), rgba(45,212,191,0))', zIndex: 5, pointerEvents: 'none', borderRadius: `${CR} ${CR} 0 0` }} />
                )}
                {browser.edgeScrollDirection === 'down' && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 'clamp(20px,2.6vh,32px)', background: 'linear-gradient(to top, rgba(45,212,191,0.35), rgba(45,212,191,0))', zIndex: 5, pointerEvents: 'none', borderRadius: `0 0 ${CR} ${CR}` }} />
                )}
                <div ref={viewRef} style={{
                    width: '100%', height: '100%', borderRadius: CR, overflow: 'hidden', background: '#000',
                    border: CB, boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                }}>
                    <div style={{
                        width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'rgba(255,255,255,0.25)', fontSize: '18px'
                    }}>
                        {browser.loading ? '⏳ Loading video...' : '🎬 Video playing in BrowserView overlay'}
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', padding: 'clamp(10px,1.5vh,20px)', gap: GAP, overflow: 'hidden',
            marginTop: '0', marginLeft: 'clamp(10px,1.5vw,20px)', marginRight: 'clamp(10px,1.5vw,20px)',
            paddingBottom: 'clamp(10px, 1.5vh, 20px)'
        }}>
            {/* CATEGORY BUTTONS: Much bigger, more spacing */}
            {/* CATEGORY BUTTONS: Dedicated Horizontal Nav Bar */}
            <div style={{
                display: 'flex', gap: 'clamp(16px, 2vw, 24px)', flexShrink: 0, flexWrap: 'wrap', overflow: 'visible',
                padding: 'clamp(16px, 2vh, 24px)', alignItems: 'center',
                background: 'rgba(15, 23, 42, 0.6)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)',
                marginBottom: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}>
                {YT_CATS.map(c => <GazeButton key={c.id} id={`yc-${c.id}`} onClick={() => { setCatId(c.id); disableGaze(); }}
                    gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode style={pill(catId === c.id, '#FF6B6B')}>{c.label}</GazeButton>)}
            </div>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gridTemplateRows: 'repeat(2,1fr)', gap: GAP, overflow: 'hidden', minHeight: 0 }}>
                {cat.videos.slice(0, 6).map((v, i) => (
                    <GazeButton key={v.id + i} id={`yv-${i}`} onClick={() => { setPlaying(v); disableGaze(); }}
                        gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode style={{ ...cs, overflow: 'hidden' }}>
                        <div style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%',
                            background: 'linear-gradient(135deg,rgba(255,50,50,0.12),rgba(255,50,50,0.04))', minHeight: 0
                        }}>
                            <div style={{
                                width: 'clamp(64px,9vh,90px)', height: 'clamp(64px,9vh,90px)', borderRadius: '50%',
                                background: 'rgba(255,50,50,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 'clamp(30px,4vh,42px)', border: '2px solid rgba(255,50,50,0.3)'
                            }}>▶</div>
                        </div>
                        <div style={{ padding: 'clamp(14px,2vh,22px)', flexShrink: 0, width: '100%', textAlign: 'center' }}>
                            <div style={{
                                fontSize: 'clamp(18px,2.2vh,24px)', fontWeight: 600, color: '#E6EDF3', lineHeight: 1.3,
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                            }}>{v.title}</div>
                            <div style={{ fontSize: 'clamp(14px,1.8vh,18px)', color: 'rgba(255,255,255,0.45)', marginTop: '8px' }}>{v.ch}</div>
                        </div>
                    </GazeButton>
                ))}
            </div>
        </div>
    );
};

// ── KNOWLEDGE PANEL ──
const KnowledgePanel = ({ ige, ts, onSpeak, isNavHidden }: { ige: boolean; ts: number; onSpeak: (t: string) => void; isNavHidden?: boolean; }) => {
    const ws = useWS();
    const [selCat, setSelCat] = useState<string | null>(null);
    const [selArt, setSelArt] = useState<any>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => { ws.getKnowledgeCategories(); }, []);
    useEffect(() => { if (selCat) ws.getKnowledgeArticles(selCat); }, [selCat]);
    useEffect(() => { if (ws.knowledgeArticle && selArt && ws.knowledgeArticle.id === selArt.id) setSelArt(ws.knowledgeArticle); }, [ws.knowledgeArticle]);

    if (selArt) return (
        <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', padding: GAP, gap: GAP, overflow: 'hidden',
            marginTop: 'clamp(50px,6vh,65px)', marginLeft: 'clamp(10px,1.5vw,20px)',
            paddingBottom: 'clamp(20px, 2.5vh, 40px)'
        }}>
            <div style={{ display: 'flex', gap: '12px', flexShrink: 0, flexWrap: 'wrap' }}>
                <GazeButton id="kb-back" onClick={() => setSelArt(null)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{ ...cb, color: AC, borderColor: `${AC}40` }}>← Back</GazeButton>
                <GazeButton id="kb-read" onClick={() => onSpeak(selArt.title + '. ' + selArt.content)} gazeEnabled={ige}
                    gazeEnabledTimestamp={ts} isDarkMode style={{ ...cb, color: TL, borderColor: `${TL}40` }}>🔊 Read</GazeButton>
                <div style={{ flexBasis: 'clamp(60px, 8vw, 100px)', flexShrink: 0 }} /> {/* Safe Zone for Gaze Toggle */}
                <GazeButton id="kb-stop" onClick={() => ws.stopSpeaking()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{ ...cb, color: '#E53E3E', borderColor: 'rgba(229,62,62,0.3)' }}>⏹ Stop</GazeButton>
                <GazeButton id="kb-scr" onClick={() => scrollRef.current?.scrollBy({ top: 250, behavior: 'smooth' })} gazeEnabled={ige}
                    gazeEnabledTimestamp={ts} isDarkMode style={{ ...cb, color: AC, borderColor: `${AC}40` }}>⬇ Scroll</GazeButton>
            </div>
            <div ref={scrollRef} style={{
                ...cs, flex: 1, width: '100%', height: 'auto', alignItems: 'flex-start', justifyContent: 'flex-start',
                padding: 'clamp(24px,3.5vh,40px)', overflow: 'auto', minHeight: 0
            }}>
                <h2 style={{ fontSize: 'clamp(22px,3vh,32px)', fontWeight: 700, color: '#E6EDF3', margin: '0 0 10px 0', fontFamily: "'Outfit',sans-serif" }}>{selArt.title}</h2>
                <div style={{ fontSize: 'clamp(16px,2.2vh,22px)', color: 'rgba(255,255,255,0.85)', lineHeight: 1.75, whiteSpace: 'pre-line' as const }}>{selArt.content}</div>
            </div>
        </div>
    );

    return (
        <div style={{
            flex: 1, display: 'flex', gap: GAP, padding: GAP, overflow: 'hidden', paddingBottom: 'clamp(20px, 2.5vh, 40px)'
        }}>
            <div style={{
                width: 'clamp(220px,26vw,320px)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '10px',
                background: GL, borderRadius: '20px', padding: 'clamp(14px,1.8vh,20px)', border: '1px solid rgba(100,140,180,0.15)', overflow: 'auto'
            }}>
                {ws.knowledgeCategories.map((c: any) => (
                    <GazeButton key={c.id} id={`kc-${c.id}`} onClick={() => { setSelCat(c.id); setSelArt(null); }}
                        gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={{
                            width: '100%', padding: 'clamp(14px,1.8vh,20px) 14px', textAlign: 'left' as const,
                            background: selCat === c.id ? `${c.color || AC}20` : 'transparent',
                            borderLeft: selCat === c.id ? `4px solid ${c.color || AC}` : '4px solid transparent',
                            borderRadius: '0 14px 14px 0', border: 'none', minHeight: 'clamp(60px,7.5vh,78px)',
                            display: 'flex', alignItems: 'center', gap: '10px'
                        }}>
                        <span style={{ fontSize: 'clamp(22px,2.8vh,30px)' }}>{c.icon}</span>
                        <div>
                            <div style={{ fontSize: 'clamp(15px,1.8vh,19px)', fontWeight: 600, color: selCat === c.id ? (c.color || AC) : '#E6EDF3' }}>{c.title}</div>
                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>{c.article_count} articles</div>
                        </div>
                    </GazeButton>
                ))}
            </div>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gridTemplateRows: 'repeat(3,1fr)', gap: GAP, overflow: 'hidden', minHeight: 0 }}>
                {selCat && ws.knowledgeArticles.length ? ws.knowledgeArticles.slice(0, 6).map((a: any, i: number) => (
                    <GazeButton key={a.id} id={`ka-${i}`} onClick={() => { setSelArt({ ...a, content: a.summary || 'Loading...' }); ws.getKnowledgeArticle(a.id); }}
                        gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={{ ...cs, justifyContent: 'space-between', alignItems: 'flex-start', padding: 'clamp(16px,2.2vh,26px)' }}>
                        <div style={{ fontSize: 'clamp(16px,2vh,20px)', fontWeight: 600, color: '#E6EDF3', lineHeight: 1.35, flex: 1, textAlign: 'left' }}>{a.title}</div>
                        <div style={{
                            fontSize: 'clamp(13px,1.5vh,16px)', color: 'rgba(255,255,255,0.45)', lineHeight: 1.4, marginTop: '8px', textAlign: 'left',
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden'
                        }}>{a.summary}</div>
                    </GazeButton>
                )) : (
                    <div style={{
                        gridColumn: '1/-1', gridRow: '1/-1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'rgba(255,255,255,0.25)', fontSize: '18px'
                    }}>
                        {selCat ? '⏳ Loading...' : '← Select a category'}
                    </div>
                )}
            </div>
        </div>
    );
};

// ── QUICK SEARCH PANEL (with gaze cursor forwarding) ──
const QuickSearchPanel = ({ ige, ts, browser, gpRef, goBack: goGridBack, disableGaze, isNavHidden, onTopicActive }: {
    ige: boolean; ts: number; browser: ReturnType<typeof useGazeBrowser>; gpRef: React.MutableRefObject<{ x: number; y: number }>;
    goBack: () => void;
    disableGaze: () => void;
    isNavHidden?: boolean;
    onTopicActive?: (active: boolean) => void;
}) => {
    const ws = useWS();
    const [topic, setTopic] = useState<QuickTopic | null>(null);
    const [showLinksSidebar, setShowLinksSidebar] = useState(false);
    const viewRef = useRef<HTMLDivElement>(null);
    const hasInitRef = useRef(false);

    useEffect(() => {
        onTopicActive?.(!!topic);
    }, [topic, onTopicActive]);

    useEffect(() => {
        if (!hasInitRef.current) {
            hasInitRef.current = true;
            ws.getQuickSnapshot();
        }
    }, [ws.getQuickSnapshot]);
    const isWebTopic = !!topic && topic.mode === 'web';
    const isCardTopic = !!topic && topic.mode === 'card';

    useEffect(() => {
        if (!topic || topic.mode !== 'web') return;
        let cancelled = false;
        const raf = requestAnimationFrame(() => {
            if (cancelled || !viewRef.current) return;
            const r = viewRef.current.getBoundingClientRect();
            if (r.width > 50 && r.height > 50) {
                browser.openPage(topic.url, {
                    x: Math.round(r.left),
                    y: Math.round(r.top),
                    width: Math.round(r.width),
                    height: Math.round(r.height),
                });
            }
        });
        return () => { cancelled = true; cancelAnimationFrame(raf); };
    }, [topic?.id, topic?.mode, topic?.url, isNavHidden]);

    // Removed per-topic quick snapshot fetch

    // Removed broken rest reminder timeout

    const openTopic = useCallback((next: QuickTopic) => {
        setTopic(next);
        setShowLinksSidebar(true);
        disableGaze();
        if (next.mode === 'card' && !ws.quickSnapshot) {
            ws.getQuickSnapshot();
        }
    }, [disableGaze, ws.getQuickSnapshot]);

    const closeWebTopic = useCallback(() => {
        browser.closePage();
        setTopic(null);
        setShowLinksSidebar(true);
        disableGaze();
    }, [browser, disableGaze]);

    const handleBrowserBack = useCallback(async () => {
        if (browser.canGoBack) {
            await browser.goBack();
            return;
        }
        closeWebTopic();
    }, [browser, closeWebTopic]);

    const openLiveWebFromCard = useCallback(() => {
        if (!topic) return;
        setTopic({ ...topic, mode: 'web' });
        setShowLinksSidebar(true);
        disableGaze();
    }, [topic, disableGaze]);

    const speakCardSummary = useCallback(() => {
        if (!topic || !ws.quickSnapshot) return;
        if (topic.id === 'weather_indore') {
            const d = ws.quickSnapshot.weather;
            ws.speak(d?.ok ? `Weather in ${d.city}. Temperature ${d.temp_c} degrees. ${d.condition || ''}` : 'Weather data is unavailable right now.');
            return;
        }
        if (topic.id === 'cricket_score') {
            const d = ws.quickSnapshot.cricket;
            ws.speak(d?.ok ? `${d.match}. ${d.summary}. ${d.status}.` : 'Cricket score is unavailable right now.');
            return;
        }
        if (topic.id === 'gold_price') {
            const d = ws.quickSnapshot.gold;
            ws.speak(d?.ok ? `Gold futures ${d.price} ${d.currency}. Change ${d.change_percent || 0} percent.` : 'Gold price is unavailable right now.');
            return;
        }
    }, [topic, ws.quickSnapshot, ws.speak]);

    if (isWebTopic && topic) {
        return (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bg, paddingBottom: 'clamp(10px, 1.5vh, 20px)' }}>
                {/* TOP REGION: Toolbar & Status — reduced height to maximize web content */}
                <div style={{
                    height: '18%', minHeight: '120px', width: '100%',
                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                    padding: '0 clamp(16px,2vw,24px)', boxSizing: 'border-box'
                }}>
                    <div style={{
                        display: 'flex', gap: 'clamp(8px,1vw,12px)', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
                        padding: 'clamp(6px,1vh,10px) clamp(16px,2vw,24px)',
                        width: '100%', boxSizing: 'border-box',
                        background: 'rgba(20,30,40,0.7)', borderBottom: '1px solid rgba(90,110,130,0.3)', borderRadius: '16px 16px 0 0',
                    }}>
                        <GazeButton id="bv-close" onClick={closeWebTopic} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...cb, color: '#FF8A65', borderColor: 'rgba(255,138,101,0.4)', flex: 1, minWidth: 'clamp(100px,9vw,140px)', padding: 'clamp(10px,1.5vh,16px) clamp(20px,2vw,30px)', minHeight: 'clamp(50px, 6vh, 70px)' }}>✕ Close</GazeButton>
                        <GazeButton id="bv-click-qs" onClick={() => browser.clickAtGaze(gpRef.current.x, gpRef.current.y)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...cb, color: TL, borderColor: `${TL}50`, flex: 1, minWidth: 'clamp(100px,9vw,140px)', padding: 'clamp(10px,1.5vh,16px) clamp(20px,2vw,30px)', minHeight: 'clamp(50px, 6vh, 70px)' }}>👆 Click Here</GazeButton>
                        <GazeButton id="bv-up" onClick={() => browser.scrollUp()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...cb, flex: 1, minWidth: 'clamp(100px,9vw,140px)', padding: 'clamp(10px,1.5vh,16px) clamp(20px,2vw,30px)', minHeight: 'clamp(50px, 6vh, 70px)' }}>⬆ Up</GazeButton>
                        <GazeButton id="bv-down" onClick={() => browser.scrollDown()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...cb, flex: 1, minWidth: 'clamp(100px,9vw,140px)', padding: 'clamp(10px,1.5vh,16px) clamp(20px,2vw,30px)', minHeight: 'clamp(50px, 6vh, 70px)' }}>⬇ Down</GazeButton>

                        <div style={{ flexBasis: 'clamp(80px, 10vw, 120px)', flexShrink: 0 }} /> {/* Safe Zone for Gaze Toggle - Center Space */}

                        <GazeButton id="bv-back" onClick={handleBrowserBack} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...cb, flex: 1, minWidth: 'clamp(100px,9vw,140px)', color: '#FFCC80', borderColor: 'rgba(255,204,128,0.45)', padding: 'clamp(10px,1.5vh,16px) clamp(20px,2vw,30px)', minHeight: 'clamp(50px, 6vh, 70px)' }}>
                            {browser.canGoBack ? '← Back' : '← Exit'}
                        </GazeButton>
                        <GazeButton id="bv-zoom-in" onClick={() => browser.adjustZoom(0.25)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...cb, minWidth: 'clamp(70px,6vw,100px)', color: '#B3E5FC', borderColor: 'rgba(179,229,252,0.45)', padding: 'clamp(10px,1.5vh,16px) clamp(16px,2vw,24px)', minHeight: 'clamp(50px, 6vh, 70px)' }}>🔍+</GazeButton>
                        <GazeButton id="bv-zoom-out" onClick={() => browser.adjustZoom(-0.25)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...cb, minWidth: 'clamp(70px,6vw,100px)', color: '#B3E5FC', borderColor: 'rgba(179,229,252,0.45)', padding: 'clamp(10px,1.5vh,16px) clamp(16px,2vw,24px)', minHeight: 'clamp(50px, 6vh, 70px)' }}>🔍-</GazeButton>
                        <GazeButton id="bv-links-toggle" onClick={() => setShowLinksSidebar((s) => !s)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...cb, minWidth: 'clamp(120px,10vw,160px)', color: '#A5D6A7', borderColor: 'rgba(165,214,167,0.45)', padding: 'clamp(10px,1.5vh,16px) clamp(20px,2vw,30px)', minHeight: 'clamp(50px, 6vh, 70px)' }}>
                            {showLinksSidebar ? '✕ Hide Links' : '📋 Show Links'}
                        </GazeButton>
                    </div>
                    <div style={{
                        fontSize: 'clamp(14px,1.6vh,18px)', color: 'rgba(255,255,255,0.7)', padding: 'clamp(6px,1vh,10px) clamp(16px,2vw,24px)',
                        fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', boxSizing: 'border-box',
                        background: 'rgba(15,20,30,0.8)', borderBottom: '1px solid rgba(90,110,130,0.5)', borderRadius: '0 0 16px 16px'
                    }}>
                        🔍 {topic.label} • Zoom {browser.zoomFactor.toFixed(2)}x • {browser.pageLinks.length} links • <span style={{ color: TL }}>AAC zoom mode active</span>
                    </div>
                </div>

                {/* BOTTOM 75% REGION: Navigation Sidebar + Browser */}
                <div style={{ height: '75%', display: 'flex', width: '100%', padding: 'clamp(12px,1.5vh,20px) clamp(16px,2vw,24px)', boxSizing: 'border-box', gap: 'clamp(12px,1.5vw,20px)' }}>
                    {showLinksSidebar && (
                        <div style={{
                            flex: '0 0 clamp(260px, 24vw, 360px)',
                            height: '100%',
                            background: 'rgba(14, 22, 32, 0.95)',
                            border: '1px solid rgba(100,140,180,0.4)',
                            borderRadius: '16px',
                            padding: 'clamp(12px,1.5vh,18px)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 'clamp(8px,1vh,12px)',
                            overflow: 'hidden',
                        }}>
                            <div style={{ fontSize: 'clamp(16px,2vh,20px)', fontWeight: 700, color: '#E6EDF3' }}>📋 Page Links</div>
                            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 }}>
                                {browser.pageLinks.length ? browser.pageLinks.map((link, idx) => (
                                    <GazeButton
                                        key={`${link.href}-${idx}`}
                                        id={`bv-link-${idx}`}
                                        onClick={() => { browser.navigateTo(link.href); disableGaze(); }}
                                        gazeEnabled={ige}
                                        gazeEnabledTimestamp={ts}
                                        isDarkMode
                                        style={{ ...cb, minHeight: 'clamp(64px,8vh,90px)', width: '100%', justifyContent: 'flex-start', textAlign: 'left' as const, fontSize: 'clamp(14px,1.8vh,18px)' }}
                                    >
                                        {link.text}
                                    </GazeButton>
                                )) : (
                                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'clamp(14px,1.8vh,18px)' }}>No links detected on this page.</div>
                                )}
                            </div>
                            <GazeButton id="bv-links-refresh" onClick={() => browser.refreshLinks()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                                style={{ ...cb, minHeight: 'clamp(56px,7vh,78px)', color: '#90CAF9', borderColor: 'rgba(144,202,249,0.45)' }}>🔄 Refresh Links</GazeButton>
                        </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                        {browser.edgeScrollDirection === 'up' && (
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 'clamp(20px,2.6vh,32px)', background: 'linear-gradient(to bottom, rgba(45,212,191,0.35), rgba(45,212,191,0))', zIndex: 5, pointerEvents: 'none' }} />
                        )}
                        {browser.edgeScrollDirection === 'down' && (
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 'clamp(20px,2.6vh,32px)', background: 'linear-gradient(to top, rgba(45,212,191,0.35), rgba(45,212,191,0))', zIndex: 5, pointerEvents: 'none' }} />
                        )}
                        <div ref={viewRef} style={{
                            width: '100%', height: '100%', borderRadius: CR, overflow: 'hidden', background: '#fff',
                            border: CB, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                        }}>
                            <div style={{
                                width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#999', fontSize: '15px',
                            }}>{browser.loading ? '⏳ Loading...' : '🌐 Web content loaded — teal cursor follows your gaze'}</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (isCardTopic && topic) {
        const snapshot = ws.quickSnapshot;
        const isCached = !!snapshot?.cached;
        const weather = snapshot?.weather;
        const cricket = snapshot?.cricket;
        const gold = snapshot?.gold;
        const stocks = snapshot?.stocks;

        const cardBody = (() => {
            if (topic.id === 'weather_indore') {
                if (!weather?.ok) return 'Weather data unavailable right now.';
                return [
                    `Temperature: ${weather.temp_c ?? '-'} C`,
                    `Feels Like: ${weather.feels_like_c ?? '-'} C`,
                    `Condition: ${weather.condition || 'Unknown'}`,
                    `Humidity: ${weather.humidity ?? '-'}%`,
                    `Wind: ${weather.wind_kph ?? '-'} km/h`,
                ].join('\n');
            }
            if (topic.id === 'cricket_score') {
                if (!cricket?.ok) return 'Cricket update unavailable right now.';
                return [
                    cricket.match || 'Cricket Match',
                    cricket.summary || '',
                    `Status: ${cricket.status || 'Update available'}`,
                    cricket.venue ? `Venue: ${cricket.venue}` : '',
                ].filter(Boolean).join('\n');
            }
            if (topic.id === 'gold_price') {
                if (!gold?.ok) return 'Gold data unavailable right now.';
                return [
                    `Gold Futures: ${gold.price ?? '-'}`,
                    `Currency: ${gold.currency || '-'}`,
                    `Change: ${gold.change ?? '-'} (${gold.change_percent ?? '-'}%)`,
                    stocks?.ok ? `Sensex: ${stocks.sensex?.price ?? '-'} | Nifty: ${stocks.nifty?.price ?? '-'}` : '',
                ].filter(Boolean).join('\n');
            }
            return 'No quick data available.';
        })();

        return (
            <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', padding: GAP, gap: GAP, overflow: 'hidden', paddingBottom: 'clamp(20px, 2.5vh, 40px)'
            }}>
                <div style={{ display: 'flex', gap: 'clamp(14px,2vw,24px)', flexWrap: 'wrap' }}>
                    <GazeButton id="qs-card-back" onClick={() => { setTopic(null); disableGaze(); }} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={{ ...cb, color: '#FF8A65', borderColor: 'rgba(255,138,101,0.4)' }}>← Back</GazeButton>
                    <GazeButton id="qs-card-refresh" onClick={() => ws.getQuickSnapshot(true)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={{ ...cb, color: '#90CAF9', borderColor: 'rgba(144,202,249,0.45)' }}>🔄 Refresh Data</GazeButton>
                    <div style={{ flexBasis: 'clamp(60px, 8vw, 100px)', flexShrink: 0 }} /> {/* Safe Zone for Gaze Toggle */}
                    <GazeButton id="qs-card-open-web" onClick={openLiveWebFromCard} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={{ ...cb, color: '#A5D6A7', borderColor: 'rgba(165,214,167,0.45)' }}>🌐 Open Live Web</GazeButton>
                    <GazeButton id="qs-card-read" onClick={speakCardSummary} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={{ ...cb, color: TL, borderColor: `${TL}50` }}>🔊 Read Answer Aloud</GazeButton>
                    {isCached && (
                        <div style={{ ...cb, color: '#7DD3FC', borderColor: 'rgba(125,211,252,0.4)', background: 'rgba(14,116,144,0.18)' }}>
                            📡 Cached
                        </div>
                    )}
                </div>

                <div style={{
                    ...cs,
                    flex: 1,
                    alignItems: 'flex-start',
                    justifyContent: 'flex-start',
                    padding: 'clamp(34px, 4.5vh, 58px)',
                    overflow: 'auto',
                    whiteSpace: 'pre-line' as const,
                }}>
                    <div style={{ fontSize: 'clamp(30px,4.2vh,46px)', fontWeight: 700, color: '#E6EDF3', marginBottom: '24px' }}>
                        {topic.icon} {topic.label}
                    </div>
                    <div style={{ fontSize: 'clamp(22px,3vh,34px)', color: 'rgba(255,255,255,0.92)', lineHeight: 1.8 }}>
                        {cardBody}
                    </div>
                    {!snapshot && (
                        <div style={{ marginTop: '30px', fontSize: 'clamp(18px,2.4vh,26px)', color: 'rgba(255,255,255,0.55)' }}>
                            Loading data...
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', padding: GAP, gap: GAP, overflow: 'hidden', paddingBottom: 'clamp(20px, 2.5vh, 40px)'
        }}>
            <div style={{
                textAlign: 'center', color: '#E6EDF3', fontSize: 'clamp(22px,3vh,30px)', fontWeight: 700,
                padding: 'clamp(8px,1.5vh,16px) 0', flexShrink: 0, fontFamily: "'Outfit',sans-serif", letterSpacing: '1.5px',
            }}>🔍 QUICK SEARCH</div>
            <div style={{
                flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gridTemplateRows: 'repeat(2,1fr)',
                gap: 'clamp(16px,2.8vh,30px)', padding: 'clamp(8px,1.5vh,20px) clamp(20px,4vw,60px)', overflow: 'hidden', minHeight: 0,
            }}>
                {QUICK_TOPICS.map((t) => (
                    <GazeButton key={t.id} id={`qs-${t.id}`} onClick={() => openTopic(t)}
                        gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode style={{ ...cs, gap: 'clamp(12px,2vh,20px)' }}>
                        <span style={{ fontSize: 'clamp(38px,5.5vh,58px)' }}>{t.icon}</span>
                        <span style={{ fontSize: 'clamp(17px,2.3vh,23px)', fontWeight: 600, color: '#E6EDF3', fontFamily: "'Outfit',sans-serif" }}>{t.label}</span>
                    </GazeButton>
                ))}
            </div>
        </div>
    );
};

// ── WHATSAPP PANEL ──
const WhatsAppPanel = ({ ige, ts, browser, gpRef, goBack: goGridBack, isNavHidden }: {
    ige: boolean; ts: number; browser: ReturnType<typeof useGazeBrowser>; gpRef: React.MutableRefObject<{ x: number; y: number }>;
    goBack: () => void;
    isNavHidden?: boolean;
}) => {
    const [connected, setConnected] = useState(false);
    const viewRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!connected) return;
        let cancelled = false;
        const raf = requestAnimationFrame(() => {
            if (cancelled || !viewRef.current) return;
            const r = viewRef.current.getBoundingClientRect();
            if (r.width > 50 && r.height > 50)
                browser.openPage('https://web.whatsapp.com', { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) });
        });
        return () => { cancelled = true; cancelAnimationFrame(raf); };
    }, [connected]);

    // Gaze cursor forwarding handled centrally by main component

    const close = useCallback(() => { browser.closePage(); setConnected(false); }, [browser]);

    if (connected) return (
        <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingBottom: 'clamp(20px, 2.5vh, 40px)',
        }}>
            {/* ── HORIZONTAL TOOLBAR ── */}
            <div style={{
                display: 'flex', gap: 'clamp(14px,2vw,24px)', flexWrap: 'wrap', alignItems: 'center',
                padding: 'clamp(8px,1.2vh,14px) clamp(14px,2vw,24px)',
                background: 'rgba(20,30,40,0.7)', borderBottom: '1px solid rgba(90,110,130,0.3)',
                flexShrink: 0
            }}>
                <GazeButton id="bv-close" onClick={close} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{
                        ...cb, color: '#FF8A65', borderColor: 'rgba(255,138,101,0.4)', flex: 1, minWidth: 'clamp(100px,10vw,140px)',
                        fontSize: 'clamp(17px,2.2vh,22px)', padding: 'clamp(14px,2vh,22px) clamp(16px,2vw,24px)'
                    }}>✕ Close</GazeButton>
                <GazeButton id="bv-click" onClick={() => browser.clickAtGaze(gpRef.current.x, gpRef.current.y)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{
                        ...cb, color: TL, borderColor: `${TL}50`, flex: 1.2, minWidth: 'clamp(120px,12vw,160px)',
                        fontSize: 'clamp(17px,2.2vh,22px)', padding: 'clamp(14px,2vh,22px) clamp(16px,2vw,24px)'
                    }}>👆 Click Here</GazeButton>
                <GazeButton id="bv-up" onClick={() => browser.scrollUp()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{
                        ...cb, flex: 1, minWidth: 'clamp(100px,10vw,130px)',
                        fontSize: 'clamp(17px,2.2vh,22px)', padding: 'clamp(14px,2vh,22px) clamp(16px,2vw,24px)'
                    }}>⬆ Up</GazeButton>
                <GazeButton id="bv-down" onClick={() => browser.scrollDown()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{
                        ...cb, flex: 1, minWidth: 'clamp(100px,10vw,130px)',
                        fontSize: 'clamp(17px,2.2vh,22px)', padding: 'clamp(14px,2vh,22px) clamp(16px,2vw,24px)'
                    }}>⬇ Down</GazeButton>

                <div style={{ flexBasis: 'clamp(60px, 8vw, 100px)', flexShrink: 0 }} /> {/* Safe Zone for Gaze Toggle */}

                <GazeButton id="bv-back" onClick={() => browser.canGoBack && browser.goBack()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    disabled={!browser.canGoBack}
                    style={{
                        ...cb, flex: 1, minWidth: 'clamp(80px,8vw,110px)',
                        fontSize: 'clamp(17px,2.2vh,22px)', padding: 'clamp(14px,2vh,22px) clamp(16px,2vw,24px)'
                    }}>← Back</GazeButton>
                <GazeButton id="bv-fwd" onClick={() => browser.canGoForward && browser.goForward()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    disabled={!browser.canGoForward}
                    style={{
                        ...cb, flex: 1, minWidth: 'clamp(80px,8vw,110px)',
                        fontSize: 'clamp(17px,2.2vh,22px)', padding: 'clamp(14px,2vh,22px) clamp(16px,2vw,24px)'
                    }}>→ Fwd</GazeButton>
            </div>
            <div style={{
                fontSize: 'clamp(15px,1.8vh,18px)', color: '#25D366', padding: 'clamp(6px,1vh,10px) clamp(14px,2vw,24px)',
                flexShrink: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px'
            }}>
                <WhatsAppIcon size={20} /> WhatsApp Web — Scan QR from your phone to connect</div>
            <div style={{ flex: 1, padding: '0 clamp(14px,2vw,24px) clamp(10px,1.5vh,16px)', overflow: 'hidden', minHeight: 0 }}>
                <div ref={viewRef} style={{
                    width: '100%', height: '100%', borderRadius: CR, overflow: 'hidden', background: '#111B21',
                    border: '2px solid rgba(37,211,102,0.3)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                }}>
                    <div style={{
                        width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'rgba(255,255,255,0.3)', fontSize: '15px', gap: '8px'
                    }}>{browser.loading ? '⏳ Loading WhatsApp...' : <><WhatsAppIcon size={18} /> WhatsApp loaded</>}</div>
                </div>
            </div>
        </div>
    );

    return (
        <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: GAP,
            marginTop: isNavHidden ? '0' : 'clamp(95px,12.5vh,125px)', paddingBottom: 'clamp(20px, 2.5vh, 40px)', transition: 'margin-top 0.3s ease'
        }}>
            <div style={{ ...cs, width: 'clamp(420px,42vw,620px)', height: 'auto', padding: 'clamp(40px,5.5vh,65px)', gap: 'clamp(20px,3.2vh,36px)' }}>
                <div style={{ color: '#25D366', display: 'flex' }}><WhatsAppIcon size={88} /></div>
                <h2 style={{ fontSize: 'clamp(24px,3.2vh,34px)', fontWeight: 700, color: '#E6EDF3', margin: 0, fontFamily: "'Outfit',sans-serif" }}>WhatsApp Web</h2>
                <p style={{ fontSize: 'clamp(15px,2vh,19px)', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: 0, textAlign: 'center', maxWidth: '420px' }}>
                    Connect WhatsApp to send messages using eye gaze. Scan a QR code with your phone.
                </p>
                <GazeButton id="wa-connect" onClick={() => setConnected(true)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{
                        ...cb, background: 'rgba(37,211,102,0.15)', color: '#25D366', borderColor: 'rgba(37,211,102,0.4)',
                        padding: 'clamp(18px,2.4vh,26px) clamp(40px,5.5vw,60px)', fontSize: 'clamp(17px,2.2vh,22px)', fontWeight: 700, borderRadius: '50px'
                    }}>
                    Open WhatsApp Web
                </GazeButton>
            </div>
        </div>
    );
};

// ── SOCIAL PANEL ──
const SocialPanel = ({ ige, ts, browser, gpRef, goBack, disableGaze, isNavHidden, setView }: {
    ige: boolean, ts: number, browser: any, gpRef: React.MutableRefObject<{ x: number; y: number }>, goBack: () => void, disableGaze: () => void, isNavHidden: boolean, setView?: (view: any) => void
}) => {
    const [topic, setTopic] = useState<{ id: string, url: string, label: string } | null>(null);

    useEffect(() => {
        if (!topic) return;
        let cancelled = false;
        const raf = requestAnimationFrame(() => {
            if (cancelled) return;
            const container = document.getElementById('browser-view-container');
            if (container) {
                const r = container.getBoundingClientRect();
                browser.openPage(topic.url, {
                    x: Math.round(r.left),
                    y: Math.round(r.top),
                    width: Math.round(r.width),
                    height: Math.round(r.height),
                });
            }
        });
        return () => { cancelled = true; cancelAnimationFrame(raf); };
    }, [topic?.id, topic?.url, isNavHidden, browser]);

    // Reuse the QuickSearchPanel browser layout when a topic is selected
    if (topic && browser.isOpen) {
        return (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bg, paddingBottom: 'clamp(20px, 2.5vh, 40px)' }}>
                <div style={{
                    height: '25%', minHeight: '160px', width: '100%',
                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                    padding: '0 clamp(16px,2vw,24px)', boxSizing: 'border-box'
                }}>
                    <div style={{
                        display: 'flex', gap: 'clamp(8px,1vw,12px)', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
                        padding: 'clamp(8px,1vh,12px) clamp(16px,2vw,24px)', width: '100%', boxSizing: 'border-box',
                        background: 'rgba(20,30,40,0.7)', borderBottom: '1px solid rgba(90,110,130,0.3)', borderRadius: '16px 16px 0 0',
                    }}>
                        <GazeButton id="soc-close" onClick={() => { browser.closePage(); setTopic(null); }} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...cb, color: '#FF8A65', borderColor: 'rgba(255,138,101,0.4)', flex: 1, minWidth: 'clamp(100px,9vw,140px)' }}>✕ Close</GazeButton>
                        <GazeButton id="soc-click" onClick={() => browser.clickAtGaze(gpRef.current.x, gpRef.current.y)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...cb, color: TL, borderColor: `${TL}50`, flex: 1, minWidth: 'clamp(100px,9vw,140px)' }}>👆 Click Here</GazeButton>
                        <GazeButton id="soc-up" onClick={() => browser.scrollUp()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...cb, flex: 1, minWidth: 'clamp(100px,9vw,140px)' }}>⬆ Up</GazeButton>
                        <GazeButton id="soc-down" onClick={() => browser.scrollDown()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...cb, flex: 1, minWidth: 'clamp(100px,9vw,140px)' }}>⬇ Down</GazeButton>

                        <div style={{ flexBasis: 'clamp(60px, 8vw, 100px)', flexShrink: 0 }} /> {/* Safe Zone for Gaze Toggle */}

                        <GazeButton id="soc-back" onClick={() => browser.goBack()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...cb, flex: 1, minWidth: 'clamp(100px,9vw,140px)', color: '#FFCC80', borderColor: 'rgba(255,204,128,0.45)' }}>
                            {browser.canGoBack ? '← Back' : '← Exit'}
                        </GazeButton>
                        <GazeButton id="soc-zoom-in" onClick={() => browser.adjustZoom(0.25)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...cb, minWidth: 'clamp(70px,6vw,100px)', color: '#B3E5FC', borderColor: 'rgba(179,229,252,0.45)' }}>🔍+</GazeButton>
                        <GazeButton id="soc-zoom-out" onClick={() => browser.adjustZoom(-0.25)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...cb, minWidth: 'clamp(70px,6vw,100px)', color: '#B3E5FC', borderColor: 'rgba(179,229,252,0.45)' }}>🔍-</GazeButton>
                    </div>
                </div>
                <div style={{ height: '75%', display: 'flex', width: '100%', padding: 'clamp(12px,1.5vh,20px) clamp(16px,2vw,24px)', boxSizing: 'border-box' }}>
                    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                        {browser.edgeScrollDirection === 'up' && (
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 'clamp(20px,2.6vh,32px)', background: 'linear-gradient(to bottom, rgba(45,212,191,0.35), rgba(45,212,191,0))', zIndex: 6, pointerEvents: 'none', borderRadius: '16px 16px 0 0' }} />
                        )}
                        {browser.edgeScrollDirection === 'down' && (
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 'clamp(20px,2.6vh,32px)', background: 'linear-gradient(to top, rgba(45,212,191,0.35), rgba(45,212,191,0))', zIndex: 6, pointerEvents: 'none', borderRadius: '0 0 16px 16px' }} />
                        )}
                        <div style={{ position: 'absolute', inset: 0, border: '4px solid rgba(45, 212, 191, 0.4)', borderRadius: '16px', zIndex: 5, pointerEvents: 'none' }} />
                        <div id="browser-view-container" style={{ width: '100%', height: '100%', background: '#fff', borderRadius: '16px', overflow: 'hidden' }} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: T.bg, padding: 'clamp(20px, 4vh, 60px)' }}>
            <h2 style={{ fontSize: 'clamp(32px, 4.5vh, 48px)', color: '#F8FAFC', marginBottom: 'clamp(40px, 6vh, 80px)', fontFamily: "'Outfit', sans-serif", fontWeight: 800 }}>
                Social Media
            </h2>
            <div style={{ display: 'flex', gap: '32px', width: 'clamp(800px, 85vw, 1200px)' }}>
                <GazeButton id="soc-linkedin"
                    onClick={() => { setTopic({ id: 'linkedin', url: 'https://www.linkedin.com', label: 'LinkedIn' }); }}
                    gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{
                        ...cb, flex: 1, height: 'clamp(160px, 22vh, 220px)', borderRadius: '20px',
                        fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(26px, 3.2vh, 38px)', fontWeight: 800,
                        background: 'rgba(10,102,194,0.15)', border: '3px solid rgba(10,102,194,0.5)', color: '#fff'
                    }}>
                    💼 LinkedIn
                </GazeButton>
                <GazeButton id="soc-gmail"
                    onClick={() => { setTopic({ id: 'gmail', url: 'https://mail.google.com', label: 'Gmail' }); }}
                    gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{
                        ...cb, flex: 1, height: 'clamp(160px, 22vh, 220px)', borderRadius: '20px',
                        fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(26px, 3.2vh, 38px)', fontWeight: 800,
                        background: 'rgba(234,67,53,0.15)', border: '3px solid rgba(234,67,53,0.5)', color: '#fff'
                    }}>
                    📧 Gmail
                </GazeButton>
                <GazeButton id="soc-whatsapp"
                    onClick={() => { if (setView) setView('whatsapp'); }}
                    gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{
                        ...cb, flex: 1, height: 'clamp(160px, 22vh, 220px)', borderRadius: '20px',
                        fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(26px, 3.2vh, 38px)', fontWeight: 800,
                        background: 'rgba(37,211,102,0.15)', border: '3px solid rgba(37,211,102,0.5)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px'
                    }}>
                    <WhatsAppIcon size={42} /> WhatsApp
                </GazeButton>
            </div>
        </div>
    );
};

// ── MAIN COMPONENT ──
const HUB_CARDS = [
    { id: 'news', label: 'News Feed', labelHindi: 'समाचार', icon: '📰', gradient: 'rgba(58, 28, 24, 0.95)' },
    { id: 'youtube', label: 'YouTube', labelHindi: 'यूट्यूब', icon: '▶️', gradient: 'rgba(56, 42, 18, 0.95)' },
    { id: 'knowledge', label: 'ALS Knowledge', labelHindi: 'जानकारी', icon: '📖', gradient: 'rgba(48, 24, 22, 0.95)' },
    { id: 'search', label: 'Quick Search', labelHindi: 'खोज', icon: '🔍', gradient: 'rgba(22, 42, 42, 0.95)' },
    { id: 'social', label: 'Social & Connect', labelHindi: 'संपर्क', icon: '🌐', gradient: 'rgba(50, 20, 28, 0.95)' },
];

const WebBrowsingScreen: React.FC<{ onNavigate: (s: string) => void; onSpeak: (t: string) => void; isDarkMode: boolean; showHindi?: boolean }> = ({
    onNavigate, onSpeak, isDarkMode, showHindi = false,
}) => {
    const { isLight } = useTheme();
    const [view, setView] = useState<ViewState>('grid');
    const { isGazeEnabled: ige, lastEnabledTimestamp: ts, disableGaze, toggleGaze } = useGazeControl();
    const browser = useGazeBrowser();
    const ws = useWS();
    const { hasRealGaze } = useRealGaze();
    const [gp, setGp] = useState({ x: 0, y: 0 });
    const gpRef = useRef({ x: 0, y: 0 });
    const [windowBounds, setWindowBounds] = useState<{ x: number; y: number; width: number; height: number; screenWidth: number; screenHeight: number; scaleFactor: number; isFullScreen: boolean; isMaximized: boolean; } | null>(null);
    const windowBoundsRef = useRef<typeof windowBounds>(null);
    const [isNavHidden, setIsNavHidden] = useState(false);
    const [isQsTopicActive, setIsQsTopicActive] = useState(false);
    const [isYtVideoActive, setIsYtVideoActive] = useState(false);

    // ── DISABLE GAZE on every view change (prevents accidental selections) ──
    useEffect(() => {
        disableGaze();
    }, [view]);

    // ── POLL WINDOW BOUNDS for coordinate mapping (same as GazeCursor.tsx) ──
    useEffect(() => {
        const updateBounds = async () => {
            try {
                const api = (window as any).electronAPI;
                if (api?.getWindowBounds) {
                    const bounds = await api.getWindowBounds();
                    if (bounds) windowBoundsRef.current = bounds;
                }
            } catch { /* browser mode */ }
        };
        updateBounds();
        const interval = setInterval(updateBounds, 2000);
        return () => clearInterval(interval);
    }, []);

    // ── SUBSCRIBE TO REAL GAZE DATA from Tobii eye tracker ──
    // Uses the exact same coordinate transform as GazeCursor.tsx
    useEffect(() => {
        const unsub = ws.subscribeGaze((data: any) => {
            if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') return;

            let rawX: number, rawY: number;
            const coordSpace = data?.coord_space === 'screen' ? 'screen' : 'window';
            if (coordSpace === 'window') {
                rawX = data.x * window.innerWidth;
                rawY = data.y * window.innerHeight;
            } else {
                const bounds = windowBoundsRef.current;
                if (bounds && (bounds.isFullScreen || bounds.isMaximized)) {
                    rawX = data.x * window.innerWidth;
                    rawY = data.y * window.innerHeight;
                } else if (bounds) {
                    const screenPixelX = data.x * bounds.screenWidth;
                    const screenPixelY = data.y * bounds.screenHeight;
                    rawX = (screenPixelX - bounds.x) * (window.innerWidth / bounds.width);
                    rawY = (screenPixelY - bounds.y) * (window.innerHeight / bounds.height);
                } else {
                    rawX = data.x * window.innerWidth;
                    rawY = data.y * window.innerHeight;
                }
            }

            // Clamp to screen
            rawX = Math.max(0, Math.min(window.innerWidth, rawX));
            rawY = Math.max(0, Math.min(window.innerHeight, rawY));

            gpRef.current = { x: rawX, y: rawY };
            setGp({ x: rawX, y: rawY });
        });
        return unsub;
    }, [ws.subscribeGaze]);

    // ── MOUSE FALLBACK for simulation mode (no eye tracker) ──
    useEffect(() => {
        const h = (e: MouseEvent) => {
            // Only use mouse position when no real gaze data is present
            if (!hasRealGaze) {
                gpRef.current = { x: e.clientX, y: e.clientY };
                setGp({ x: e.clientX, y: e.clientY });
            }
        };
        window.addEventListener('mousemove', h);
        return () => window.removeEventListener('mousemove', h);
    }, [hasRealGaze]);

    // ── FORWARD GAZE POSITION into BrowserView cursor (throttled 60fps) ──
    useEffect(() => {
        if (!browser.isOpen) return;
        const interval = setInterval(() => {
            if (ige) browser.updateGazeCursor(gpRef.current.x, gpRef.current.y);
        }, 33); // ~30fps to BrowserView for smooth gaze cursor tracking
        return () => clearInterval(interval);
    }, [browser.isOpen, ige]);

    const goBack = useCallback(() => { browser.closePage(); setView('grid'); }, [browser]);

    if (view !== 'grid') return (
        <div className={`web-hub-screen${isLight ? ' theme-light' : ''}`} style={{ position: 'absolute', inset: 0, background: T.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ zIndex: 10, flexShrink: 0 }}>
                <GlobalNavBar currentPage="web" onNavigate={onNavigate} onSpeak={onSpeak} isDarkMode={isDarkMode} onBack={goBack} />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {view === 'news' && <NewsPanel ige={ige} ts={ts} onSpeak={onSpeak} goBack={goBack} disableGaze={disableGaze} browser={browser} gpRef={gpRef} isNavHidden={isNavHidden} />}
                {view === 'youtube' && <YouTubePanel ige={ige} ts={ts} browser={browser} gpRef={gpRef} goBack={goBack} disableGaze={disableGaze} isNavHidden={isNavHidden} onVideoActive={setIsYtVideoActive} />}
                {view === 'knowledge' && <KnowledgePanel ige={ige} ts={ts} onSpeak={onSpeak} isNavHidden={isNavHidden} />}
                {view === 'search' && <QuickSearchPanel ige={ige} ts={ts} browser={browser} gpRef={gpRef} goBack={goBack} disableGaze={disableGaze} isNavHidden={isNavHidden} onTopicActive={setIsQsTopicActive} />}
                {view === 'whatsapp' && <WhatsAppPanel ige={ige} ts={ts} browser={browser} gpRef={gpRef} goBack={goBack} isNavHidden={isNavHidden} />}
                {view === 'social' && <SocialPanel ige={ige} ts={ts} browser={browser} gpRef={gpRef} goBack={goBack} disableGaze={disableGaze} isNavHidden={isNavHidden} setView={setView} />}
            </div>
        </div>
    );

    return (
        <div className={`web-hub-screen${isLight ? ' theme-light' : ''}`} style={{ position: 'absolute', inset: 0, background: T.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingBottom: 'clamp(20px, 2.5vh, 40px)' }}>
            <div style={{ zIndex: 10 }}>
                <GlobalNavBar currentPage="web" onNavigate={onNavigate} onSpeak={onSpeak} isDarkMode={isDarkMode} />
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 'clamp(-56px, -7vh, -30px)' }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, clamp(220px, 25vw, 360px)))',
                    gridTemplateRows: 'repeat(2, minmax(0, auto))',
                    alignContent: 'center',
                    justifyContent: 'center',
                    gap: 'clamp(22px, 3.5vh, 44px) clamp(28px, 3.5vw, 48px)',
                    padding: 'clamp(4px, 0.5vh, 8px) clamp(24px, 3vw, 48px)',
                    boxSizing: 'border-box'
                }}>
                    {HUB_CARDS.map(card => (
                        <GazeButton key={card.id} id={`hub-${card.id}`} onClick={() => setView(card.id as ViewState)}
                            gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="homeScreenTile"
                            contentFill={true}
                            style={{
                                width: '100%', height: '100%',
                                minHeight: 'clamp(145px, 20vh, 210px)', maxHeight: 'clamp(175px, 24vh, 250px)',
                                borderRadius: '28px', overflow: 'hidden', cursor: 'pointer',
                                border: '1px solid rgba(255, 255, 255, 0.06)',
                                background: card.gradient,
                                transition: 'border-color 150ms ease',
                                padding: 0
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                            }}>

                            {/* Inner flex layout */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
                                {/* Icon Zone — compact, shifted up */}
                                <div style={{
                                    flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    paddingTop: 'clamp(10px, 1.8vh, 20px)', paddingBottom: 'clamp(2px, 0.5vh, 6px)',
                                    opacity: 0.8, fontSize: 'clamp(38px, 5.5vh, 56px)'
                                }}>
                                    {card.icon}
                                </div>

                                {/* Bilingual Text Zone — shifted up, spacious vertical layout */}
                                <div style={{
                                    flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                                    padding: 'clamp(6px, 1vh, 12px) clamp(14px, 1.8vw, 24px) clamp(14px, 2vh, 22px)',
                                    borderRadius: '0 0 28px 28px', width: '100%', boxSizing: 'border-box',
                                    gap: '2px'
                                }}>
                                    <span style={{
                                        fontFamily: "'Outfit', system-ui", fontWeight: 700,
                                        fontSize: 'clamp(22px, 2.8vh, 32px)', color: 'rgba(255, 255, 255, 0.95)',
                                        textAlign: 'center', lineHeight: 1.2, letterSpacing: '0.3px',
                                    }}>
                                        {card.label}
                                    </span>

                                    {showHindi && (
                                        <>
                                            <div style={{ width: '40px', height: '1.5px', background: 'rgba(255,255,255,0.18)', borderRadius: '1px', margin: '10px auto 6px' }} />
                                            <span style={{
                                                fontFamily: "'Noto Sans Devanagari', sans-serif", fontWeight: 700,
                                                fontSize: 'clamp(26px, 3.2vh, 36px)', color: 'rgba(255, 210, 140, 0.95)',
                                                textAlign: 'center', lineHeight: 1.3,
                                                letterSpacing: '0.02em',
                                            }}>
                                                {card.labelHindi}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </GazeButton>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default WebBrowsingScreen;
