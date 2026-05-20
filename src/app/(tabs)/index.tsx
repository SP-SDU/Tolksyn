import Head from 'expo-router/head';

import { CaptureScreen } from '@/screens/capture';

export default function CaptureRoute() {
  return (
    <>
      <Head>
        <title>Tolksyn Capture</title>
        <meta name="description" content="Capture product labels and extract structured product data with Tolksyn." />
      </Head>
      <CaptureScreen />
    </>
  );
}
