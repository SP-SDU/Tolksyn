import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { CardDescription, CardTitle } from '@/components/ui/card';
import { Screen, ScreenTitle } from '@/components/ui/screen';
import { useAppRuntime } from '@/providers/app-provider';

export function HistoryScreen() {
  const runtime = useAppRuntime();
  const router = useRouter();
  const [attempts, setAttempts] = useState<Awaited<ReturnType<typeof runtime.attempts.listRecent>>>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void runtime.attempts.listRecent(20).then((items) => {
        if (active) {
          setAttempts(items);
        }
      });

      return () => {
        active = false;
      };
    }, [runtime]),
  );

  return (
    <Screen className="gap-3">
      <ScreenTitle title="History" subtitle="Last 20 attempts kept locally." />
      {attempts.map((attempt) => (
        <Pressable
          key={attempt.id}
          onPress={() => router.push({ pathname: '/confirm/[attemptId]', params: { attemptId: attempt.id } })}>
          <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3">
            <Image source={attempt.thumbnailUri} className="h-[72px] w-[72px] rounded-xl bg-slate-200" />
            <View className="flex-1 gap-1">
              <CardTitle className="text-base">{attempt.id}</CardTitle>
              <CardDescription>Status: {attempt.status}</CardDescription>
              <CardDescription>Created: {new Date(attempt.createdAt).toLocaleString()}</CardDescription>
            </View>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}
