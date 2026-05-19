import { fireEvent, render } from '@testing-library/react-native';

import { Button } from '@/components/ui/button';
import { AppDesign } from '@/constants/design';

describe('Button', () => {
  it('uses the design red for primary buttons', () => {
    const view = render(<Button testID="button" label="Capture" />);
    const button = view.getByTestId('button');

    expect(button).toHaveStyle({ backgroundColor: AppDesign.color.red });
    expect(view.getByText('Capture')).toHaveStyle({ color: AppDesign.color.paper });
  });

  it('visually depresses while pressed', () => {
    const view = render(<Button testID="button" label="Capture" />);
    const button = view.getByTestId('button');

    expect(button).not.toHaveStyle({ opacity: 0.7 });

    fireEvent(button, 'pressIn');

    expect(button).toHaveStyle({ opacity: 0.68, transform: [{ translateY: 4 }, { scale: 0.97 }] });
  });
});
