/** Approved Focus / Serene Home. Both layouts retain the same targets and actions. */
import React from 'react';
import GazeButton from '../components/core/GazeButton';
import { useGazeControl } from '../components/core/GazeControlToggle';
import { useCustomization } from '../contexts/CustomizationContext';
import { useAlertMode } from '../contexts/AlertModeContext';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { BellIcon, KeyboardIcon, FamilyIcon, SettingsIcon, GridIcon, TVIcon, GlobalIcon } from '../components/icons/Icons';
import { MusicNoteIcon } from '../components/music/MusicNoteIcon';

interface HomeScreenProps {
  onNavigate: (screen: string) => void;
  onSpeak: (text: string) => void;
  isDarkMode?: boolean;
  showHindi?: boolean;
}
const PhrasesIcon = ({ size = 56 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 3h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2Z" />
    <path d="M7 7h10M7 11h10M7 15h6" />
  </svg>
);
const HOME_TILES = [
  { id: 'ph', label: 'Phrases', screen: 'phrases', icon: PhrasesIcon, kind: 'communication' },
  { id: 'pp', label: 'People', screen: 'people', icon: FamilyIcon, kind: 'people' },
  { id: 'med', label: 'Assistance', sub: 'Daily Care', screen: 'medical', icon: BellIcon, kind: 'assistance' },
  { id: 'ac', label: 'Activities', screen: 'activities', icon: TVIcon, kind: 'activities' },
  { id: 'web', label: 'Web Browsing', screen: 'web', icon: GlobalIcon, kind: 'web' },
  { id: 'music', label: 'Music', screen: 'music', icon: MusicNoteIcon, kind: 'music' },
  { id: 'fp', label: 'Design Home', screen: 'floor-plan', icon: GridIcon, kind: 'design' },
  { id: 'st', label: 'Settings', screen: 'settings', icon: SettingsIcon, kind: 'settings' },
];
const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigate, onSpeak, isDarkMode = true }) => {
  const { settings } = useCustomization();
  const { isGazeEnabled, lastEnabledTimestamp } = useGazeControl();
  const { enableAlertMode } = useAlertMode();
  const showUrgent = settings.homeEmergencyLaunchMode === 'alert';
  const gazeProps = { isDarkMode, gazeEnabled: isGazeEnabled, gazeEnabledTimestamp: lastEnabledTimestamp };
  return (
    <div className="home-screen">
      <GlobalNavBar currentPage="home" onNavigate={onNavigate} isDarkMode={isDarkMode} />
      <main className="home-stage" data-urgent={showUrgent}>
        <div className="home-primary-actions">
          {showUrgent && <GazeButton id="dock-0" className="quickcall-btn home-dock-urgent" {...gazeProps}
            dwellCategory="emergencyButton" onClick={() => { onSpeak('Urgent needs'); enableAlertMode(); }}>
            <span className="home-symbol"><BellIcon size={56} color="currentColor" strokeWidth={1.8} /></span>
            <span className="home-primary-label">Urgent Needs</span>
          </GazeButton>}
          <GazeButton id={showUrgent ? 'dock-1' : 'dock-0'} className="quickcall-btn home-dock-phrases" {...gazeProps}
            dwellCategory="homeScreenTile" onClick={() => onNavigate('quickwords')}>
            <span className="home-symbol"><PhrasesIcon /></span>
            <span className="home-primary-label">Quick Phrases <span className="home-plus">＋ →</span></span>
          </GazeButton>
          <GazeButton id="kb" className="grid-card grid-card-keyboard home-primary-keyboard" {...gazeProps}
            dwellCategory="homeScreenTile" onClick={() => onNavigate('keyboard')}>
            <span className="home-symbol"><KeyboardIcon size={56} color="currentColor" strokeWidth={1.8} /></span>
            <span className="home-primary-label">Keyboard</span>
          </GazeButton>
        </div>
        <div className="home-choice-grid">
          {HOME_TILES.map(tile => <GazeButton key={tile.id} id={tile.id} className={`grid-card grid-card-${tile.kind}`}
            {...gazeProps} dwellCategory="homeScreenTile" onClick={() => onNavigate(tile.screen)}>
            <span className="home-symbol"><tile.icon size={56} color="currentColor" strokeWidth={1.8} /></span>
            <span className="home-choice-label"><span className="grid-card-label">{tile.label}</span>
              {tile.sub && <span className="home-subtitle">{tile.sub}</span>}
            </span>
          </GazeButton>)}
        </div>
      </main>
    </div>
  );
};
export default React.memo(HomeScreen);
