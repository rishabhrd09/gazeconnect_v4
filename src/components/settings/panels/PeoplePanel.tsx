import React, { useState, useCallback } from 'react';
import { darkColors, lightColors, layout, typography, spacing } from '../../../utils/design';
import GazeButton from '../../core/GazeButton';
import ConfirmDialog from '../shared/ConfirmDialog';
import { useCustomization } from '../../../contexts/CustomizationContext';
import { generateDefaultPhrases } from '../../../services/defaultCustomization';
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
      display: 'flex', flexDirection: 'column', gap: spacing[3],
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
            placeholder="e.g. Papa"
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
            placeholder="e.g. पापा"
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
  isDarkMode: boolean;
  onRemove: () => void;
}> = ({ person, isDarkMode, onRemove }) => {
  const colors = isDarkMode ? darkColors : lightColors;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: spacing[3],
      padding: `${spacing[3]} ${spacing[4]}`,
      backgroundColor: colors.background.secondary,
      borderRadius: layout.borderRadius.lg,
      border: `1px solid ${colors.border.main}`,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        backgroundColor: colors.accent.subtle,
        border: `2px solid ${colors.accent.main}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.accent.main }}>
          {person.name[0]}
        </span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, color: colors.text.primary }}>
          {person.name}
          <span style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary, marginLeft: 8 }}>
            ({person.nameHi})
          </span>
        </div>
        <div style={{ display: 'none', fontSize: typography.fontSize.sm, color: colors.text.tertiary }}>
          {person.role}
        </div>
        <div style={{ display: 'none', fontSize: typography.fontSize.sm, color: colors.text.tertiary }}>
          {person.role} · {person.phrases.length} phrases
        </div>
      </div>
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
  const { people, addPerson, removePerson, resetPeople } = useCustomization();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

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
        Manage the names in your care network. You can add or remove people whenever needed.
      </div>

      {people.map(person => (
        <PersonRow
          key={person.name}
          person={person}
          isDarkMode={isDarkMode}
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

      <AddPersonForm isDarkMode={isDarkMode} onAdd={addPerson} />

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
          onConfirm={() => { resetPeople(); setShowResetConfirm(false); }}
          onCancel={() => setShowResetConfirm(false)}
          isDarkMode={isDarkMode}
        />
      )}
    </div>
  );
};

export default PeoplePanel;
