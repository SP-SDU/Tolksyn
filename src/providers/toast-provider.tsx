import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { cn } from '@/components/ui/cn';
import {
  enqueueToast,
  initialToastState,
  nextToast,
  replaceProgressWithMessage,
  upsertProgressToast,
  type ToastEntry,
  type ToastTone,
} from '@/services/toast-state';

type ToastApi = {
  show(input: { text: string; tone?: ToastTone; durationMs?: number }): void;
  progress(input: { id: string; text: string; tone?: ToastTone }): void;
  progressDone(input: { id: string; text: string; durationMs?: number }): void;
  progressFail(input: { id: string; text: string; durationMs?: number }): void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: React.PropsWithChildren) {
  const [state, setState] = useState(initialToastState);

  useEffect(() => {
    if (!state.active || state.active.mode !== 'message' || state.active.durationMs <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      setState((current) => nextToast(current));
    }, state.active.durationMs);

    return () => {
      clearTimeout(timer);
    };
  }, [state.active]);

  const api = useMemo<ToastApi>(
    () => ({
      show({ text, tone = 'info', durationMs = 2200 }) {
        const entry: ToastEntry = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text,
          tone,
          mode: 'message',
          durationMs,
        };
        setState((current) => enqueueToast(current, entry));
      },

      progress({ id, text, tone = 'info' }) {
        const entry: ToastEntry = {
          id,
          text,
          tone,
          mode: 'progress',
          durationMs: 0,
        };
        setState((current) => upsertProgressToast(current, entry));
      },

      progressDone({ id, text, durationMs = 2500 }) {
        const entry: ToastEntry = {
          id: `${id}:done:${Date.now()}`,
          text,
          tone: 'success',
          mode: 'message',
          durationMs,
        };
        setState((current) => replaceProgressWithMessage(current, id, entry));
      },

      progressFail({ id, text, durationMs = 3500 }) {
        const entry: ToastEntry = {
          id: `${id}:fail:${Date.now()}`,
          text,
          tone: 'error',
          mode: 'message',
          durationMs,
        };
        setState((current) => replaceProgressWithMessage(current, id, entry));
      },
    }),
    [],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastHost entry={state.active} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error('useToast must be used within ToastProvider.');
  }

  return value;
}

function ToastHost({ entry }: { entry?: ToastEntry }) {
  if (!entry) {
    return null;
  }

  return (
    <View pointerEvents="box-none" className="absolute inset-0 z-50 justify-end px-4 pb-6">
      <View className={cn('rounded-xl border px-4 py-3 shadow-lg', toneContainer(entry.tone))}>
        <Text className={cn('text-sm font-medium', toneText(entry.tone))}>{entry.text}</Text>
      </View>
    </View>
  );
}

function toneContainer(tone: ToastTone) {
  if (tone === 'success') {
    return 'border-emerald-300 bg-emerald-50';
  }

  if (tone === 'warning') {
    return 'border-amber-300 bg-amber-50';
  }

  if (tone === 'error') {
    return 'border-red-300 bg-red-50';
  }

  return 'border-slate-300 bg-slate-50';
}

function toneText(tone: ToastTone) {
  if (tone === 'success') {
    return 'text-emerald-800';
  }

  if (tone === 'warning') {
    return 'text-amber-800';
  }

  if (tone === 'error') {
    return 'text-red-800';
  }

  return 'text-slate-800';
}
