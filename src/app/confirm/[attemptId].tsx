import { useLocalSearchParams } from 'expo-router';

import { ConfirmScreen } from '@/screens/confirm';

export default function ConfirmRoute() {
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();

  return <ConfirmScreen attemptId={attemptId} />;
}
