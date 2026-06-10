import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../config';
import type { OfflineAction, QueuedItem } from '../types';

async function readQueue(): Promise<QueuedItem[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.offlineQueue);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedItem[];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.offlineQueue, JSON.stringify(items));
}

export async function enqueueOffline(action: OfflineAction): Promise<QueuedItem> {
  const item: QueuedItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    createdAt: new Date().toISOString(),
  };
  const queue = await readQueue();
  queue.push(item);
  await writeQueue(queue);
  return item;
}

export async function getOfflineQueueLength(): Promise<number> {
  return (await readQueue()).length;
}

export async function flushOfflineQueue(
  send: (action: OfflineAction) => Promise<void>
): Promise<number> {
  const queue = await readQueue();
  if (queue.length === 0) return 0;

  const remaining: QueuedItem[] = [];
  let sent = 0;

  for (const item of queue) {
    try {
      await send(item.action);
      sent += 1;
    } catch {
      remaining.push(item);
    }
  }

  await writeQueue(remaining);
  return sent;
}
