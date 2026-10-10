/**
 * Add to Message (10 Oct 2026, maintainer request; see src/utils/addToMessage.ts).
 * Opened by Quick Words on the keyboard (Quick Phrases on Zone Board): four large cards,
 * two by two, for what can be added to the message being typed. The message so far is
 * shown above them; Back returns to the typing screen unchanged.
 */
import React from 'react';
import GazeButton from '../components/core/GazeButton';
import { useGazeControl } from '../components/core/GazeControlToggle';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { BellIcon, ConversationIcon, FamilyIcon } from '../components/icons/Icons';
import { messageTail, type TypingScreen } from '../utils/addToMessage';

interface AddToMessageScreenProps {
  onNavigate: (screen: string) => void;
  isDarkMode?: boolean;
  /** The message typed so far. */
  messageText: string;
  /** The typing screen Back returns to. */
  returnScreen: TypingScreen;
}

type IconComponent = React.FC<{ size?: number; color?: string; strokeWidth?: number }>;

// The drawing of Home's Phrases card, so the same choice looks the same in both places.
const PhrasesIcon: IconComponent = ({ size = 56, color = 'currentColor', strokeWidth = 1.65 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 3h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2Z" />
    <path d="M7 7h10M7 11h10M7 15h6" />
  </svg>
);

const CHOICES: Array<{ id: string; label: string; detail: string; screen: string; icon: IconComponent; kind: string }> = [
  { id: 'quick', label: 'Quick Phrases', detail: 'A word, then its sentence', screen: 'quickwords', icon: ConversationIcon, kind: 'quick' },
  { id: 'phrases', label: 'Phrases', detail: 'Ready sentences by topic', screen: 'phrases', icon: PhrasesIcon, kind: 'phrases' },
  { id: 'people', label: 'People', detail: 'Family and friends by name', screen: 'people', icon: FamilyIcon, kind: 'people' },
  { id: 'assistance', label: 'Daily Assistance', detail: 'Care and comfort requests', screen: 'medical', icon: BellIcon, kind: 'assistance' },
];

const AddToMessageScreen: React.FC<AddToMessageScreenProps> = ({
  onNavigate, isDarkMode = true, messageText, returnScreen,
}) => {
  const { isGazeEnabled, lastEnabledTimestamp } = useGazeControl();
  const tail = messageTail(messageText, 72);
  return (
    <div className="add-message-screen">
      <GlobalNavBar currentPage="add-to-message" onNavigate={onNavigate} isDarkMode={isDarkMode}
        onBack={() => onNavigate(returnScreen)} />
      <main className="add-message-stage">
        <div className="add-message-preview" aria-live="polite">
          <span className="add-message-preview-label">Your message</span>
          <span className={`add-message-preview-text${tail ? '' : ' is-empty'}`}>{tail || 'Nothing typed yet'}</span>
        </div>
        <div className="add-message-grid">
          {CHOICES.map(choice => (
            <GazeButton key={choice.id} id={`add-${choice.id}`} className={`add-message-card add-message-card-${choice.kind}`}
              isDarkMode={isDarkMode} gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp}
              dwellCategory="homeScreenTile" onClick={() => onNavigate(choice.screen)}>
              <span className="add-message-symbol"><choice.icon size={56} color="currentColor" strokeWidth={1.8} /></span>
              <span className="add-message-card-text">
                <span className="add-message-card-label">{choice.label}</span>
                <span className="add-message-card-detail">{choice.detail}</span>
              </span>
            </GazeButton>
          ))}
        </div>
      </main>
    </div>
  );
};

export default React.memo(AddToMessageScreen);
