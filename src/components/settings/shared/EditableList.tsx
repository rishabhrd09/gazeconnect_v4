import React, { useState } from 'react';
import { darkColors, lightColors, layout, typography, spacing } from '../../../utils/design';
import GazeButton from '../../core/GazeButton';

interface EditableListProps {
  items: string[];
  onUpdate: (items: string[]) => void;
  isDarkMode: boolean;
  placeholder?: string;
  maxItems?: number;
}

const EditableList: React.FC<EditableListProps> = ({
  items,
  onUpdate,
  isDarkMode,
  placeholder = 'New item...',
  maxItems = 20,
}) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const [newItem, setNewItem] = useState('');

  const handleAdd = () => {
    const trimmed = newItem.trim();
    if (!trimmed || items.length >= maxItems) return;
    onUpdate([...items, trimmed]);
    setNewItem('');
  };

  const handleRemove = (index: number) => {
    onUpdate(items.filter((_, i) => i !== index));
  };

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    backgroundColor: colors.background.tertiary,
    border: `1px solid ${colors.border.main}`,
    borderRadius: layout.borderRadius.md,
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    outline: 'none',
    flex: 1,
    minWidth: 0,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[2] }}>
      {items.map((item, index) => (
        <div
          key={index}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing[2],
            padding: `${spacing[2]} ${spacing[3]}`,
            backgroundColor: colors.background.secondary,
            borderRadius: layout.borderRadius.md,
            border: `1px solid ${colors.border.main}`,
          }}
        >
          <span style={{
            flex: 1,
            fontSize: typography.fontSize.sm,
            color: colors.text.primary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {item}
          </span>
          <GazeButton
            id={`remove-item-${index}`}
            size="sm"
            variant="emergency"
            onClick={() => handleRemove(index)}
            isDarkMode={isDarkMode}
            style={{ width: 40, height: 40, minWidth: 40, padding: 0 }}
          >
            X
          </GazeButton>
        </div>
      ))}

      {items.length < maxItems && (
        <div style={{ display: 'flex', gap: spacing[2], alignItems: 'center' }}>
          <input
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder={placeholder}
            style={inputStyle}
          />
          <GazeButton
            id="add-list-item"
            size="sm"
            variant="success"
            onClick={handleAdd}
            isDarkMode={isDarkMode}
            style={{ minWidth: 80 }}
          >
            + Add
          </GazeButton>
        </div>
      )}

      {items.length === 0 && (
        <div style={{
          padding: spacing[3],
          textAlign: 'center',
          color: colors.text.tertiary,
          fontSize: typography.fontSize.sm,
        }}>
          No items yet. Add one above.
        </div>
      )}
    </div>
  );
};

export default EditableList;
