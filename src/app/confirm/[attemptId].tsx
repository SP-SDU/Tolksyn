import { Redirect, useLocalSearchParams } from 'expo-router';

import { ConfirmScreen } from '@/screens/confirm';

export default function ConfirmRoute() {
  const { attemptId: rawAttemptId } = useLocalSearchParams<{ attemptId?: string | string[] }>();
  const attemptId = Array.isArray(rawAttemptId) ? rawAttemptId[0] : rawAttemptId;

  if (!attemptId) {
    return <Redirect href="/" />;
  }

  return <ConfirmScreen attemptId={attemptId} />;
}
