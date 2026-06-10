import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { sideLabel } from '../constants/labels';
import { useSession } from '../context/SessionContext';
import type { MoreStackParamList } from '../navigation/types';

const MENU = [
  { route: 'Timeline' as const, title: '反馈时间线', desc: '查看历史疼痛与日志' },
  { route: 'VisitFeedback' as const, title: '复诊反馈', desc: '复诊前提交总结' },
  { route: 'Education' as const, title: '患者教育', desc: '红黄绿风险说明' },
  { route: 'Settings' as const, title: '账户与解绑', desc: '解除病例绑定' },
];

export function MoreMenuScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const { session } = useSession();
  const c = session?.case;

  return (
    <ScreenScaffold title="更多" subtitle={c ? `${c.title} · ${sideLabel(c.side)}` : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        {MENU.map((item) => (
          <Pressable
            key={item.route}
            onPress={() => navigation.navigate(item.route)}
            style={styles.row}
          >
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowDesc}>{item.desc}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </ScrollView>
    </ScreenScaffold>
  );
}

export function SettingsScreen() {
  const { session, unbind, offlineCount } = useSession();
  const c = session?.case;

  const confirmUnbind = () => {
    Alert.alert(
      '解除绑定',
      '解绑后将无法继续向该病例提交反馈，需要重新输入邀请码。确定继续？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '解绑',
          style: 'destructive',
          onPress: () => unbind().catch(() => Alert.alert('解绑失败', '请检查网络后重试')),
        },
      ]
    );
  };

  return (
    <ScreenScaffold title="账户与解绑">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>当前病例</Text>
          <Text style={styles.value}>{c?.title || '—'}</Text>
          <Text style={styles.meta}>{c?.patientName ? `患者 ${c.patientName}` : ''}</Text>
        </View>

        {offlineCount > 0 ? (
          <View style={styles.warn}>
            <Text style={styles.warnText}>本地还有 {offlineCount} 条未同步反馈，建议先联网同步再解绑。</Text>
          </View>
        ) : null}

        <Pressable onPress={confirmUnbind} style={styles.danger}>
          <Text style={styles.dangerText}>解除病例绑定</Text>
        </Pressable>
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  rowText: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  rowDesc: { fontSize: 13, color: '#64748b' },
  chevron: { fontSize: 22, color: '#94a3b8' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  label: { fontSize: 13, color: '#64748b' },
  value: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  meta: { fontSize: 14, color: '#475569' },
  warn: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 12,
  },
  warnText: { fontSize: 13, color: '#92400e', lineHeight: 18 },
  danger: {
    marginTop: 8,
    backgroundColor: '#fee2e2',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  dangerText: { color: '#b91c1c', fontSize: 16, fontWeight: '700' },
});
