import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { ScreenScaffold } from '../components/ScreenScaffold';
import {
  painTypeLabel,
  regionLabel,
  sceneLabel,
  severityLabel,
} from '../constants/labels';
import { useSession } from '../context/SessionContext';
import type { TimelineData } from '../types';

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function TimelineScreen() {
  const { bindingId } = useSession();
  const [data, setData] = useState<TimelineData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!bindingId) return;
    const res = await api.timeline(bindingId);
    setData(res);
  }, [bindingId]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const items = [
    ...(data?.painFeedback || []).map((p) => ({
      id: p.id,
      time: p.created_at,
      title: `疼痛 · ${regionLabel(p.region_id)} · ${severityLabel(p.severity)}`,
      detail: [painTypeLabel(p.pain_type), sceneLabel(p.activity_scene), p.notes]
        .filter(Boolean)
        .join(' · '),
    })),
    ...(data?.usageLogs || []).map((u) => ({
      id: u.id,
      time: u.created_at,
      title: `使用日志 · ${u.wear_minutes} 分钟`,
      detail: [
        u.comfort_score != null ? `舒适度 ${u.comfort_score}/5` : '',
        sceneLabel(u.activity_scene),
        u.notes,
      ]
        .filter(Boolean)
        .join(' · '),
    })),
    ...(data?.feedback || []).map((f) => ({
      id: f.id,
      time: f.created_at,
      title: f.feedback_type === 'visit_summary' ? '复诊反馈' : '文字反馈',
      detail: f.content,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return (
    <ScreenScaffold title="反馈时间线" subtitle="仅显示您在本机提交的记录">
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {items.length === 0 ? (
          <Text style={styles.empty}>还没有反馈记录</Text>
        ) : (
          items.map((item) => (
            <View key={item.id} style={styles.item}>
              <Text style={styles.time}>{formatTime(item.time)}</Text>
              <Text style={styles.title}>{item.title}</Text>
              {item.detail ? <Text style={styles.detail}>{item.detail}</Text> : null}
            </View>
          ))
        )}
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40, fontSize: 15 },
  item: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  time: { fontSize: 12, color: '#94a3b8' },
  title: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  detail: { fontSize: 14, color: '#475569', lineHeight: 20 },
});
