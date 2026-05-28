import React, { useCallback, useState } from 'react';
import { darkColors, lightColors, layout, typography, spacing } from '../../../utils/design';
import GazeButton from '../../core/GazeButton';
import ConfirmDialog from '../shared/ConfirmDialog';
import { useCustomization } from '../../../contexts/CustomizationContext';
import { generateDefaultPhrases } from '../../../services/defaultCustomization';
import { MAX_ACTIVE_PEOPLE } from '../../../types/customization';
import type { Person } from '../../../types/customization';

interface PeoplePanelProps {
  isDarkMode: boolean;
}

const AddPersonForm: React.FC<{
  isDarkMode: boolean;
  onAdd: (person: Person) => void;
}> = ({ isDarkMode, onAdd }) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const [name, setName] = useState('');
  const [nameHi, setNameHi] = useState('');
  const role = 'Other';

  const handleAdd = useCallback(() => {
    const trimmedName = name.trim();
    const trimmedHi = nameHi.trim() || trimmedName;
    if (!trimmedName) return;
    onAdd({
      name: trimmedName,
      nameHi: trimmedHi,
      role,
      phrases: generateDefaultPhrases(trimmedName, trimmedHi),
    });
    setName('');
    setNameHi('');
  }, [name, nameHi, role, onAdd]);

  const inputStyle: React.CSSProperties = {
    padding: '10px 14px',
    backgroundColor: colors.background.tertiary,
    border: `1px solid ${colors.border.main}`,
    borderRadius: layout.borderRadius.md,
    color: colors.text.primary,
    fontSize: typography.fontSize.base,
    outline: 'none',
    width: '100%',
  };

  return (
    <div style={{
      padding: spacing[4],
      backgroundColor: colors.background.secondary,
      borderRadius: layout.borderRadius.lg,
      border: `1px solid ${colors.accent.main}40`,
      display: 'flex',
      flexDirection: 'column',
      gap: spacing[3],
    }}>
      <div style={{ fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, color: colors.accent.main }}>
        Add New Person
      </div>
      <div style={{ display: 'flex', gap: spacing[3], flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary, display: 'block', marginBottom: 4 }}>
            Name (English)
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. पापा"
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary, display: 'block', marginBottom: 4 }}>
            Name (Hindi)
          </label>
          <input
            value={nameHi}
            onChange={e => setNameHi(e.target.value)}
            placeholder="e.g. Papa"
            style={inputStyle}
          />
        </div>
      </div>
      <GazeButton
        id="add-person-btn"
        size="sm"
        variant="success"
        onClick={handleAdd}
        isDarkMode={isDarkMode}
        gazeEnabled={false}
        gazeEnabledTimestamp={0}
        style={{ alignSelf: 'flex-start', minWidth: 120 }}
      >
        + Add Person
      </GazeButton>
    </div>
  );
};

const PersonRow: React.FC<{
  person: Person;
  isActive: boolean;
  activeCount: number;
  isDarkMode: boolean;
  onToggleActive: () => void;
  onRemove: () => void;
}> = ({ person, isActive, activeCount, isDarkMode, onToggleActive, onRemove }) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const canShow = isActive || activeCount < MAX_ACTIVE_PEOPLE;
  const canHide = !isActive || activeCount > 1;
  const toggleDisabled = isActive ? !canHide : !canShow;
  const activeBorder = isActive ? colors.accent.main : colors.border.main;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: spacing[3],
      padding: `${spacing[3]} ${spacing[4]}`,
      backgroundColor: colors.background.secondary,
      borderRadius: layout.borderRadius.lg,
      border: `1px solid ${activeBorder}`,
    }}>
      <div style={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        backgroundColor: isActive ? colors.accent.subtle : colors.background.tertiary,
        border: `2px solid ${activeBorder}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.accent.main }}>
          {person.name[0]}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, color: colors.text.primary }}>
          {person.name}
          <span style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary, marginLeft: 8 }}>
            ({person.nameHi})
          </span>
        </div>
        <div style={{
          fontSize: typography.fontSize.sm,
          color: isActive ? colors.accent.main : colors.text.tertiary,
          fontWeight: 600,
        }}>
          {isActive ? 'Shown on People screen' : 'Saved, hidden from People screen'}
        </div>
      </div>
      <GazeButton
        id={`toggle-active-${person.name}`}
        size="sm"
        variant={isActive ? 'success' : 'default'}
        onClick={onToggleActive}
        disabled={toggleDisabled}
        isDarkMode={isDarkMode}
        gazeEnabled={false}
        gazeEnabledTimestamp={0}
        style={{ minWidth: 120 }}
      >
        {isActive ? 'Shown' : activeCount >= MAX_ACTIVE_PEOPLE ? 'Max 9' : 'Show'}
      </GazeButton>
      <GazeButton
        id={`remove-${person.name}`}
        size="sm"
        variant="emergency"
        onClick={onRemove}
        isDarkMode={isDarkMode}
        gazeEnabled={false}
        gazeEnabledTimestamp={0}
        style={{ minWidth: 80 }}
      >
        Remove
      </GazeButton>
    </div>
  );
};

const PeoplePanel: React.FC<PeoplePanelProps> = ({ isDarkMode }) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const { people, addPerson, removePerson, resetPeople, updatePeople } = useCustomization();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const activeCount = people.filter(person => person.isActive !== false).length;

  const handleAddPerson = useCallback((person: Person) => {
    const willBeActive = activeCount < MAX_ACTIVE_PEOPLE;
    addPerson({ ...person, isActive: willBeActive });
    setLimitMessage(willBeActive ? null : `Saved as hidden. Hide another person before showing more than ${MAX_ACTIVE_PEOPLE}.`);
  }, [activeCount, addPerson]);

  const handleToggleActive = useCallback((person: Person) => {
    const isActive = person.isActive !== false;
    if (!isActive && activeCount >= MAX_ACTIVE_PEOPLE) {
      setLimitMessage(`Only ${MAX_ACTIVE_PEOPLE} people can be shown at once. Hide one person, then show another.`);
      return;
    }
    if (isActive && activeCount <= 1) {
      setLimitMessage('Keep at least one person shown on the People screen.');
      return;
    }
    setLimitMessage(null);
    updatePeople(people.map(p => (
      p.name === person.name ? { ...p, isActive: !isActive } : p
    )));
  }, [activeCount, people, updatePeople]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[4] }}>
      <div style={{
        fontSize: typography.fontSize.xl,
        color: colors.text.primary,
        fontWeight: typography.fontWeight.bold,
      }}>
        People Management
      </div>
      <div style={{
        fontSize: typography.fontSize.sm,
        color: colors.text.secondary,
      }}>
        Manage saved names and choose up to {MAX_ACTIVE_PEOPLE} to show on the People screen.
      </div>
      <div style={{
        padding: `${spacing[3]} ${spacing[4]}`,
        backgroundColor: colors.background.secondary,
        borderRadius: layout.borderRadius.lg,
        border: `1px solid ${colors.accent.main}55`,
        color: colors.text.primary,
        fontSize: typography.fontSize.sm,
        fontWeight: 700,
      }}>
        Displayed on People screen: {activeCount} / {MAX_ACTIVE_PEOPLE}
        {limitMessage && (
          <span style={{ color: colors.warning.main, marginLeft: spacing[3] }}>
            {limitMessage}
          </span>
        )}
      </div>

      {people.map(person => (
        <PersonRow
          key={person.name}
          person={person}
          isActive={person.isActive !== false}
          activeCount={activeCount}
          isDarkMode={isDarkMode}
          onToggleActive={() => handleToggleActive(person)}
          onRemove={() => removePerson(person.name)}
        />
      ))}

      {people.length === 0 && (
        <div style={{
          padding: spacing[4],
          backgroundColor: colors.background.secondary,
          borderRadius: layout.borderRadius.lg,
          border: `1px solid ${colors.border.main}`,
          textAlign: 'center',
          color: colors.text.tertiary,
          fontSize: typography.fontSize.base,
        }}>
          No people configured. Add someone below.
        </div>
      )}

      <AddPersonForm isDarkMode={isDarkMode} onAdd={handleAddPerson} />

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <GazeButton
          id="reset-people-defaults"
          size="sm"
          variant="default"
          onClick={() => setShowResetConfirm(true)}
          isDarkMode={isDarkMode}
          gazeEnabled={false}
          gazeEnabledTimestamp={0}
          style={{ minWidth: 160 }}
        >
          Reset to Defaults
        </GazeButton>
      </div>

      {showResetConfirm && (
        <ConfirmDialog
          title="Reset People?"
          message="This will replace all people with the default set. Your custom people will be lost."
          confirmLabel="Reset"
          onConfirm={() => { resetPeople(); setShowResetConfirm(false); setLimitMessage(null); }}
          onCancel={() => setShowResetConfirm(false)}
          isDarkMode={isDarkMode}
        />
      )}
    </div>
  );
};

export default PeoplePanel;
