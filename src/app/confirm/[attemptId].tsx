import { Redirect, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';

import { ConfirmScreen } from '@/screens/confirm';

export default function ConfirmRoute() {
  const { attemptId: rawAttemptId } = useLocalSearchParams<{ attemptId?: string | string[] }>();
  const attemptId = Array.isArray(rawAttemptId) ? rawAttemptId[0] : rawAttemptId;

  if (!attemptId) {
    return <Redirect href="/" />;
  }

  return (
    <>
      <Head>
        <title>Tolksyn Verify</title>
        <meta name="description" content="Verify and edit Tolksyn extraction results before submitting them." />
      </Head>
      <ConfirmScreen attemptId={attemptId} />
    </>
  );
}
