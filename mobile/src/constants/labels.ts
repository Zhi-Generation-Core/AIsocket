import type { ActivityScene, PainType, Severity } from '../types';

export const PAIN_REGIONS: Array<{ id: string; label: string; short: string }> = [
  { id: 'rim', label: '口缘', short: '口缘' },
  { id: 'anterior', label: '前侧', short: '前' },
  { id: 'medial', label: '内侧', short: '内' },
  { id: 'lateral', label: '外侧', short: '外' },
  { id: 'posterior', label: '后侧', short: '后' },
  { id: 'distal', label: '末端', short: '末' },
];

export const SEVERITY_OPTIONS: Array<{ value: Severity; label: string; color: string }> = [
  { value: 'mild', label: '轻微', color: '#22c55e' },
  { value: 'moderate', label: '中等', color: '#f59e0b' },
  { value: 'severe', label: '严重', color: '#ef4444' },
];

export const PAIN_TYPE_OPTIONS: Array<{ value: PainType; label: string }> = [
  { value: 'pressure', label: '压痛' },
  { value: 'friction', label: '摩擦' },
  { value: 'numbness', label: '麻木' },
  { value: 'loose', label: '松动' },
  { value: 'unstable', label: '不稳定' },
];

export const SCENE_OPTIONS: Array<{ value: ActivityScene; label: string }> = [
  { value: 'standing', label: '站立' },
  { value: 'walking', label: '行走' },
  { value: 'stairs', label: '上下楼' },
  { value: 'sitting', label: '久坐后' },
  { value: 'exercise', label: '运动后' },
  { value: 'other', label: '其他' },
];

export function regionLabel(id: string): string {
  return PAIN_REGIONS.find((r) => r.id === id)?.label || id;
}

export function severityLabel(v: Severity): string {
  return SEVERITY_OPTIONS.find((s) => s.value === v)?.label || v;
}

export function painTypeLabel(v: string | null): string {
  if (!v) return '';
  return PAIN_TYPE_OPTIONS.find((p) => p.value === v)?.label || v;
}

export function sceneLabel(v: string | null): string {
  if (!v) return '';
  return SCENE_OPTIONS.find((s) => s.value === v)?.label || v;
}

export function sideLabel(side: string | null): string {
  if (side === 'left') return '左侧';
  if (side === 'right') return '右侧';
  return side || '未标注';
}
