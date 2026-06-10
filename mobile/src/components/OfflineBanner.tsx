import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../context/SessionContext';

export function OfflineBanner() {
  const { offlineCount, isOnline, syncOffline } = useSession();

  if (isOnline && offlineCount === 0) return null;

  return (
    <View style={[styles.bar, !isOnline ? styles.offline : styles.pending]}>
      <Text style={styles.text}>
        {!isOnline
          ? `当前离线，${offlineCount} 条反馈待同步`
          : `${offlineCount} 条反馈待同步`}
      </Text>
      {isOnline && offlineCount > 0 ? (
        <Pressable onPress={() => syncOffline()} style={styles.btn}>
          <Text style={styles.btnText}>立即同步</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  offline: { backgroundColor: '#fef3c7' },
  pending: { backgroundColor: '#e0f2fe' },
  text: { flex: 1, color: '#334155', fontSize: 13 },
  btn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
