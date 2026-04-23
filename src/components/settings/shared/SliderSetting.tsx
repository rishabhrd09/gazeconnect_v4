import React from 'react';
import { darkColors, lightColors, layout, typography, spacing } from '../../../utils/design';
import GazeButton from '../../core/GazeButton';

interface SliderSettingProps {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
  isDarkMode: boolean;
}

const SliderSetting: React.FC<SliderSettingProps> = ({
  label,
  description,
  value,
  min,
  max,
  step,
  unit = '',
  onChange,
  isDarkMode,
}) => {
  const colors = isDarkMode ? darkColors : lightColors;

  return (
    <div style={{
      padding: spacing[4],
      backgroundColor: colors.background.secondary,
      borderRadius: layout.borderRadius.lg,
      border: `1px solid ${colors.border.main}`,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing[3],
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
        <div style={{
          fontSize: typography.fontSize.xl,
          fontWeight: typography.fontWeight.bold,
          color: colors.accent.main,
        }}>
          {value}{unit}
        </div>
      </div>
      <div style={{ display: 'flex', gap: spacing[2], alignItems: 'center' }}>
        <GazeButton
          id={`${label}-decrease`}
          size="sm"
          onClick={() => onChange(Math.max(min, value - step))}
          isDarkMode={isDarkMode}
          gazeEnabled={false}
          gazeEnabledTimestamp={0}
        >
          −
        </GazeButton>
        <div style={{
          flex: 1,
          height: 8,
          backgroundColor: colors.background.tertiary,
          borderRadius: 4,
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${((value - min) / (max - min)) * 100}%`,
            height: '100%',
            backgroundColor: colors.accent.main,
            borderRadius: 4,
            transition: 'width 200ms ease-out',
          }} />
        </div>
        <GazeButton
          id={`${label}-increase`}
          size="sm"
          onClick={() => onChange(Math.min(max, value + step))}
          isDarkMode={isDarkMode}
          gazeEnabled={false}
          gazeEnabledTimestamp={0}
        >
          +
        </GazeButton>
      </div>
    </div>
  );
};

export default SliderSetting;
