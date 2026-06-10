import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export function StackBackBar() {
  const navigation = useNavigation();
  if (!navigation.canGoBack()) return null;

  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => navigation.goBack()} style={styles.btn}>
        <Text style={styles.text}>← 返回</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 4 },
  btn: { alignSelf: 'flex-start', paddingVertical: 6 },
  text: { color: '#2563eb', fontSize: 15, fontWeight: '600' },
});
