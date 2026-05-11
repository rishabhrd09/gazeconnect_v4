import React from 'react';
import { darkColors, lightColors, warmColors, layout, typography, spacing } from '../../../utils/design';
import { useTheme } from '../../../contexts/ThemeContext';
import GazeButton from '../../core/GazeButton';

interface SelectSettingProps {
  label: string;
  description?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  isDarkMode: boolean;
}

const SelectSetting: React.FC<SelectSettingProps> = ({
  label,
  description,
  value,
  options,
  onChange,
  isDarkMode,
}) => {
  const { isWarm } = useTheme();
  const colors = isWarm ? warmColors : isDarkMode ? darkColors : lightColors;

  return (
    <div style={{
      padding: spacing[4],
      backgroundColor: isWarm ? warmColors.background.elevated : colors.background.secondary,
      borderRadius: layout.borderRadius.lg,
      border: `1px solid ${colors.border.main}`,
    }}>
      <div style={{ marginBottom: spacing[3] }}>
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
      <div style={{ display: 'flex', gap: spacing[2], flexWrap: 'wrap' }}>
        {options.map((option) => (
          <GazeButton
            key={option.value}
            id={`${label}-${option.value}`}
            size="md"
            variant={value === option.value ? 'primary' : 'default'}
            onClick={() => onChange(option.value)}
            isDarkMode={isDarkMode}
            gazeEnabled={false}
            gazeEnabledTimestamp={0}
            style={{
              minWidth: 200,
              textAlign: 'center',
              whiteSpace: 'normal',
              lineHeight: 1.3,
            }}
          >
            {option.label}
          </GazeButton>
        ))}
      </div>
    </div>
  );
};

export default SelectSetting;
