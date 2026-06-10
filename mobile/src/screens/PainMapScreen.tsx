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
import { PainRegionMap } from '../components/PainRegionMap';
import { ScreenScaffold } from '../components/ScreenScaffold';
import {
  PAIN_TYPE_OPTIONS,
  SCENE_OPTIONS,
  SEVERITY_OPTIONS,
} from '../constants/labels';
import { useSession } from '../context/SessionContext';
import type { ActivityScene, PainType, Severity } from '../types';

export function PainMapScreen() {
  const { submitPainMap, offlineCount, isOnline } = useSession();
  const [regionId, setRegionId] = useState<string | null>(null);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [painType, setPainType] = useState<PainType | null>(null);
  const [scene, setScene] = useState<ActivityScene | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setRegionId(null);
    setSeverity(null);
    setPainType(null);
    setScene(null);
    setNotes('');
  };

  const onSubmit = async () => {
    if (!regionId || !severity) {
      Alert.alert('请完成选择', '请先选择疼痛区域和程度');
      return;
    }
    setSaving(true);
    try {
      await submitPainMap({
        regionId,
        severity,
        painType: painType || undefined,
        activityScene: scene || undefined,
        notes: notes.trim() || undefined,
      });
      Alert.alert(
        '已记录',
        isOnline
          ? '疼痛反馈已提交，假肢师可在桌面端查看'
          : `已保存到本地，恢复网络后自动同步（队列 ${offlineCount + 1} 条）`
      );
      reset();
    } catch (e) {
      Alert.alert('提交失败', e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenScaffold title="疼痛地图" subtitle="30 秒内完成一次反馈">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PainRegionMap selectedId={regionId} onSelect={setRegionId} />

        <ChipSelect label="疼痛程度" options={SEVERITY_OPTIONS} value={severity} onChange={setSeverity} />

        <ChipSelect
          label="疼痛类型（可选）"
          options={PAIN_TYPE_OPTIONS}
          value={painType}
          onChange={setPainType}
        />

        <ChipSelect
          label="发生场景（可选）"
          options={SCENE_OPTIONS}
          value={scene}
          onChange={setScene}
        />

        <View style={styles.notesWrap}>
          <Text style={styles.label}>补充说明（可选）</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="例如：行走约 10 分钟后出现"
            multiline
            style={styles.notes}
          />
        </View>

        <Pressable
          onPress={onSubmit}
          disabled={saving}
          style={[styles.submit, saving && styles.submitDisabled]}
        >
          <Text style={styles.submitText}>{saving ? '提交中…' : '提交疼痛反馈'}</Text>
        </Pressable>
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 20, paddingBottom: 40 },
  notesWrap: { gap: 8 },
  label: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  notes: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: '#fff',
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
