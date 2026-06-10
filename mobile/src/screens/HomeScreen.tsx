import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { api } from '../api/client';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { regionLabel, severityLabel, sideLabel } from '../constants/labels';
import { useSession } from '../context/SessionContext';
import type { MainTabParamList } from '../navigation/types';
import type { SummaryData } from '../types';

export function HomeScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const { session, bindingId, refresh } = useSession();
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadSummary = useCallback(async () => {
    if (!bindingId) return;
    const data = await api.summary(bindingId, 14);
    setSummary(data);
  }, [bindingId]);

  useFocusEffect(
    useCallback(() => {
      loadSummary().catch(() => {});
    }, [loadSummary])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
      await loadSummary();
    } finally {
      setRefreshing(false);
    }
  };

  const c = session?.case;

  return (
    <ScreenScaffold title="首页" subtitle={c ? `${c.title} · ${sideLabel(c.side)}` : undefined}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.card}>
          <Text style={styles.cardLabel}>当前病例</Text>
          <Text style={styles.cardTitle}>{c?.title || '—'}</Text>
          <Text style={styles.meta}>
            {c?.patientName ? `患者 ${c.patientName}` : ''}
            {c?.activityLevel ? ` · 活动等级 ${c.activityLevel}` : ''}
          </Text>
        </View>

        <View style={styles.quickRow}>
          <QuickAction emoji="🗺️" label="疼痛地图" onPress={() => navigation.navigate('PainMap')} />
          <QuickAction emoji="📝" label="使用日志" onPress={() => navigation.navigate('UsageLog')} />
        </View>

        {summary ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>近 {summary.days} 天摘要</Text>
            <Text style={styles.stat}>
              平均佩戴 {summary.usage.avg_wear_minutes} 分钟/天 · 舒适度{' '}
              {Number(summary.usage.avg_comfort).toFixed(1)}/5
            </Text>
            {summary.painHotspots.length > 0 ? (
              <View style={styles.hotspots}>
                <Text style={styles.hotTitle}>高频疼痛区域</Text>
                {summary.painHotspots.slice(0, 4).map((h, i) => (
                  <Text key={`${h.region_id}-${h.severity}-${i}`} style={styles.hotItem}>
                    {regionLabel(h.region_id)} · {severityLabel(h.severity)} · {h.count} 次
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={styles.empty}>暂无疼痛记录，可在「疼痛地图」快速反馈</Text>
            )}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>最近设计版本</Text>
          {(session?.recentVersions || []).length === 0 ? (
            <Text style={styles.empty}>暂无版本信息</Text>
          ) : (
            session?.recentVersions.map((v) => (
              <Text key={v.id} style={styles.version}>
                v{v.version_number} {v.label || ''} · {v.status || '未知'}
              </Text>
            ))
          )}
        </View>
      </ScrollView>
    </ScreenScaffold>
  );
}

function QuickAction({
  emoji,
  label,
  onPress,
}: {
  emoji: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.quick}>
      <Text style={styles.quickEmoji}>{emoji}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardLabel: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  meta: { fontSize: 14, color: '#475569' },
  quickRow: { flexDirection: 'row', gap: 12 },
  quick: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  quickEmoji: { fontSize: 28 },
  quickLabel: { fontSize: 14, fontWeight: '600', color: '#334155' },
  stat: { fontSize: 14, color: '#334155', lineHeight: 20 },
  hotspots: { gap: 4, marginTop: 4 },
  hotTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  hotItem: { fontSize: 13, color: '#475569' },
  empty: { fontSize: 14, color: '#94a3b8' },
  version: { fontSize: 14, color: '#475569' },
});
