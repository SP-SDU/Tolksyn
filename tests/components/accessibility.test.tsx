import { render, screen } from '@testing-library/react-native';

import { Button } from '@/components/ui/button';
import { LabeledInput } from '@/components/ui/input';
import { ScreenView } from '@/components/ui/screen';
import { AppDesign } from '@/constants/design';

describe('shared accessibility primitives', () => {
  it('uses button labels as accessible names', () => {
    render(<Button label="Capture" />);

    expect(screen.getByLabelText('Capture')).toBeTruthy();
  });

  it('passes visible labels to text inputs', () => {
    render(<LabeledInput label="Endpoint URL" value="" />);

    expect(screen.getByLabelText('Endpoint URL')).toBeTruthy();
  });

  it('marks screen containers as main landmarks', () => {
    render(<ScreenView testID="screen" />);

    expect(screen.getByTestId('screen').props.role).toBe('main');
  });

  it('keeps primary button text contrast at WCAG AA', () => {
    expect(contrastRatio(AppDesign.color.red, AppDesign.color.paper)).toBeGreaterThanOrEqual(4.5);
  });
});

function contrastRatio(first: string, second: string) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string) {
  const [red, green, blue] = hex
    .slice(1)
    .match(/../g)!
    .map((value) => parseInt(value, 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
