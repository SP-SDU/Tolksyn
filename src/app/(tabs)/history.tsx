import Head from 'expo-router/head';

import { HistoryScreen } from '@/screens/history';

export default function HistoryRoute() {
  return (
    <>
      <Head>
        <title>Tolksyn History</title>
        <meta name="description" content="Review recent Tolksyn extraction attempts saved on this device." />
      </Head>
      <HistoryScreen />
    </>
  );
}
