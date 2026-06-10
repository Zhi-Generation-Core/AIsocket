import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PAIN_REGIONS } from '../constants/labels';

interface Props {
  selectedId: string | null;
  onSelect: (regionId: string) => void;
}

/** 简化的接受腔 2D 示意图，六区可点选 */
export function PainRegionMap({ selectedId, onSelect }: Props) {
  const center = PAIN_REGIONS.find((r) => r.id === 'anterior')!;
  const rim = PAIN_REGIONS.find((r) => r.id === 'rim')!;
  const medial = PAIN_REGIONS.find((r) => r.id === 'medial')!;
  const lateral = PAIN_REGIONS.find((r) => r.id === 'lateral')!;
  const posterior = PAIN_REGIONS.find((r) => r.id === 'posterior')!;
  const distal = PAIN_REGIONS.find((r) => r.id === 'distal')!;

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>点击下方区域，标记疼痛位置</Text>
      <View style={styles.diagram}>
        <RegionButton
          region={rim}
          selected={selectedId === rim.id}
          onPress={() => onSelect(rim.id)}
          style={styles.rim}
        />
        <View style={styles.row}>
          <RegionButton
            region={lateral}
            selected={selectedId === lateral.id}
            onPress={() => onSelect(lateral.id)}
            style={styles.side}
          />
          <RegionButton
            region={center}
            selected={selectedId === center.id}
            onPress={() => onSelect(center.id)}
            style={styles.center}
          />
          <RegionButton
            region={medial}
            selected={selectedId === medial.id}
            onPress={() => onSelect(medial.id)}
            style={styles.side}
          />
        </View>
        <RegionButton
          region={posterior}
          selected={selectedId === posterior.id}
          onPress={() => onSelect(posterior.id)}
          style={styles.wide}
        />
        <RegionButton
          region={distal}
          selected={selectedId === distal.id}
          onPress={() => onSelect(distal.id)}
          style={styles.distal}
        />
      </View>
    </View>
  );
}

function RegionButton({
  region,
  selected,
  onPress,
  style,
}: {
  region: (typeof PAIN_REGIONS)[number];
  selected: boolean;
  onPress: () => void;
  style?: object;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.region, style, selected && styles.regionSelected]}
    >
      <Text style={[styles.regionText, selected && styles.regionTextSelected]}>
        {region.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  hint: { color: '#64748b', fontSize: 14, textAlign: 'center' },
  diagram: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  region: {
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regionSelected: {
    backgroundColor: '#dbeafe',
    borderColor: '#2563eb',
  },
  regionText: { fontSize: 15, color: '#334155', fontWeight: '600' },
  regionTextSelected: { color: '#1d4ed8' },
  rim: { width: 220 },
  side: { flex: 1, minHeight: 72 },
  center: { flex: 1.2, minHeight: 88 },
  wide: { width: 220 },
  distal: { width: 160 },
});
