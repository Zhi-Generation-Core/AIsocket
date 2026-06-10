import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ChipSelect } from '../components/ChipSelect';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SCENE_OPTIONS } from '../constants/labels';
import { useSession } from '../context/SessionContext';
import type { ActivityScene } from '../types';

const COMFORT_OPTIONS = [
  { value: '1', label: '1 很差' },
  { value: '2', label: '2' },
  { value: '3', label: '3 一般' },
  { value: '4', label: '4' },
  { value: '5', label: '5 很好' },
];

export function UsageLogScreen() {
  const { submitFeedback, isOnline, offlineCount } = useSession();
  const [wearMinutes, setWearMinutes] = useState('120');
  const [comfort, setComfort] = useState<string | null>('3');
  const [scene, setScene] = useState<ActivityScene | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const onSubmit = async () => {
    const minutes = Number(wearMinutes);
    if (!Number.isFinite(minutes) || minutes < 0) {
      Alert.alert('请填写佩戴时长', '请输入有效的分钟数');
      return;
    }

    setSaving(true);
    try {
      await submitFeedback({
        feedbackType: 'usage_log',
        wearMinutes: minutes,
        comfortScore: comfort ? Number(comfort) : undefined,
        activityScene: scene || undefined,
        content: notes.trim() || undefined,
      });
      Alert.alert(
        '已记录',
        isOnline
          ? '今日使用日志已保存'
          : `已保存到本地（队列 ${offlineCount + 1} 条）`
      );
      setNotes('');
    } catch (e) {
      Alert.alert('提交失败', e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenScaffold title="使用日志" subtitle="记录今日佩戴与舒适度">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={styles.label}>今日佩戴时长（分钟）</Text>
          <TextInput
            value={wearMinutes}
            onChangeText={setWearMinutes}
            keyboardType="number-pad"
            style={styles.input}
          />
        </View>

        <ChipSelect
          label="舒适度评分"
          options={COMFORT_OPTIONS}
          value={comfort}
          onChange={setComfort}
        />

        <ChipSelect
          label="主要活动场景"
          options={SCENE_OPTIONS}
          value={scene}
          onChange={setScene}
        />

        <View style={styles.field}>
          <Text style={styles.label}>备注（可选）</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="例如：下午行走较多，口缘略紧"
            multiline
            style={[styles.input, styles.multiline]}
          />
        </View>

        <Pressable
          onPress={onSubmit}
          disabled={saving}
          style={[styles.submit, saving && styles.submitDisabled]}
        >
          <Text style={styles.submitText}>{saving ? '保存中…' : '保存今日日志'}</Text>
        </Pressable>
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 20, paddingBottom: 40 },
  field: { gap: 8 },
  label: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  submit: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
