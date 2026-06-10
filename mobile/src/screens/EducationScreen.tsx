import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenScaffold } from '../components/ScreenScaffold';

const SECTIONS = [
  {
    color: '#22c55e',
    title: '绿色 · 低风险区',
    body: '表示当前设计在该区域压力较适中。若仅有轻微不适，可先观察 1–2 天，并通过使用日志记录变化。',
  },
  {
    color: '#f59e0b',
    title: '黄色 · 需关注',
    body: '表示该区域可能存在局部压力偏高或摩擦风险。请在疼痛地图中标记具体位置和场景，便于假肢师调整。',
  },
  {
    color: '#ef4444',
    title: '红色 · 重点复核',
    body: '表示该区域风险较高，可能影响日常活动或造成皮肤损伤。请尽快联系服务机构，不要自行大幅修改接受腔。',
  },
];

export function EducationScreen() {
  return (
    <ScreenScaffold title="患者教育" subtitle="了解风险颜色含义">
      <ScrollView contentContainerStyle={styles.content}>
        {SECTIONS.map((s) => (
          <View key={s.title} style={styles.card}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{s.title}</Text>
              <Text style={styles.cardText}>{s.body}</Text>
            </View>
          </View>
        ))}

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>何时需要联系机构？</Text>
          <Text style={styles.noticeText}>· 皮肤破损、水疱或持续红肿</Text>
          <Text style={styles.noticeText}>· 接受腔明显松动或无法稳定行走</Text>
          <Text style={styles.noticeText}>· 严重疼痛持续超过 48 小时未缓解</Text>
          <Text style={styles.disclaimer}>
            本应用不提供诊断结论，所有反馈仅供复诊参考，最终调整方案由专业人员确认。
          </Text>
        </View>
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  cardBody: { flex: 1, gap: 6 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  cardText: { fontSize: 14, color: '#475569', lineHeight: 21 },
  notice: {
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    padding: 16,
    gap: 8,
    marginTop: 8,
  },
  noticeTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  noticeText: { fontSize: 14, color: '#334155', lineHeight: 20 },
  disclaimer: {
    marginTop: 8,
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
  },
});
