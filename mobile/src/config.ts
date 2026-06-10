export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE?.replace(/\/$/, '') ||
  'https://mugzju.top/socketai/api/mobile';

export const STORAGE_KEYS = {
  bindingId: '@socketai/bindingId',
  offlineQueue: '@socketai/offlineQueue',
} as const;
