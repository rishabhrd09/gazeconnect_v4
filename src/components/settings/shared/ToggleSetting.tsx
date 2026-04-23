import React from 'react';
import { darkColors, lightColors, layout, typography, spacing } from '../../../utils/design';
import GazeButton from '../../core/GazeButton';

interface ToggleSettingProps {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  isDarkMode: boolean;
}

const ToggleSetting: React.FC<ToggleSettingProps> = ({
  label,
  description,
  value,
  onChange,
  isDarkMode,
}) => {
  const colors = isDarkMode ? darkColors : lightColors;

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing[4],
      backgroundColor: colors.background.secondary,
      borderRadius: layout.borderRadius.lg,
      border: `1px solid ${colors.border.main}`,
    }}>
      <div>
        <div style={{
          fontSize: typography.fontSize.lg,
          color: colors.text.primary,
          fontWeight: typography.fontWeight.medium,
        }}>
          {label}
        </div>
        {description && (
          <div style={{
            fontSize: typography.fontSize.sm,
            color: colors.text.secondary,
            marginTop: 4,
          }}>
            {description}
          </div>
        )}
      </div>
      <GazeButton
        id={`toggle-${label.replace(/\s/g, '-').toLowerCase()}`}
        size="sm"
        variant={value ? 'success' : 'default'}
        onClick={() => onChange(!value)}
        isDarkMode={isDarkMode}
        gazeEnabled={false}
        gazeEnabledTimestamp={0}
        style={{ width: 80 }}
      >
        {value ? 'ON' : 'OFF'}
      </GazeButton>
    </div>
  );
};

export default ToggleSetting;
