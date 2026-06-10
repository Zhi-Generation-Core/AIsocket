import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { regionLabel, severityLabel } from '../constants/labels';
import { useSession } from '../context/SessionContext';
import type { SummaryData } from '../types';

export function VisitFeedbackScreen() {
  const { bindingId, submitFeedback, isOnline, offlineCount } = useSession();
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!bindingId) return;
      api.summary(bindingId, 14).then(setSummary).catch(() => {});
    }, [bindingId])
  );

  const onSubmit = async () => {
    const text = content.trim();
    if (text.length < 10) {
      Alert.alert('请补充说明', '复诊总结建议至少 10 个字，便于假肢师了解您的近况');
      return;
    }

    setSaving(true);
    try {
      await submitFeedback({
        feedbackType: 'visit_summary',
        content: text,
        payload: summary
          ? {
              autoSummary: {
                days: summary.days,
                painHotspots: summary.painHotspots.slice(0, 6),
                usage: summary.usage,
              },
            }
          : {},
      });
      Alert.alert(
        '已提交',
        isOnline ? '复诊反馈已发送给服务机构' : `已暂存本地（队列 ${offlineCount + 1} 条）`
      );
      setContent('');
    } catch (e) {
      Alert.alert('提交失败', e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenScaffold title="复诊反馈" subtitle="复诊前提交一份总结">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {summary ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>系统自动整理（近 {summary.days} 天）</Text>
            <Text style={styles.line}>
              平均佩戴 {summary.usage.avg_wear_minutes} 分钟/天，舒适度{' '}
              {Number(summary.usage.avg_comfort).toFixed(1)}/5
            </Text>
            {summary.painHotspots.length > 0 ? (
              summary.painHotspots.slice(0, 5).map((h, i) => (
                <Text key={`${h.region_id}-${i}`} style={styles.line}>
                  · {regionLabel(h.region_id)}（{severityLabel(h.severity)}）× {h.count}
                </Text>
              ))
            ) : (
              <Text style={styles.muted}>暂无疼痛记录</Text>
            )}
          </View>
        ) : null}

        <View style={styles.field}>
          <Text style={styles.label}>您的总结</Text>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="描述最近试穿的主要问题、希望调整的部位，以及日常活动感受…"
            multiline
            style={styles.input}
          />
        </View>

        <Pressable
          onPress={onSubmit}
          disabled={saving}
          style={[styles.submit, saving && styles.submitDisabled]}
        >
          <Text style={styles.submitText}>{saving ? '提交中…' : '提交复诊反馈'}</Text>
        </Pressable>
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  line: { fontSize: 14, color: '#475569', lineHeight: 20 },
  muted: { fontSize: 14, color: '#94a3b8' },
  field: { gap: 8 },
  label: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 12,
    minHeight: 160,
    textAlignVertical: 'top',
    backgroundColor: '#fff',
    fontSize: 15,
  },
  submit: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
