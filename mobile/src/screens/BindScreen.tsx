import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '../api/client';
import { useSession } from '../context/SessionContext';

export function BindScreen() {
  const { bind } = useSession();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!code.trim()) {
      setError('请输入邀请码');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await bind(code);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '绑定失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.hero}>
          <Text style={styles.brand}>SocketAI</Text>
          <Text style={styles.tagline}>接受腔患者反馈</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>绑定您的病例</Text>
          <Text style={styles.cardDesc}>
            请输入假肢师提供的邀请码。绑定后只能查看与您相关的反馈记录。
          </Text>

          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="例如 ABC123"
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
            editable={!loading}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={onSubmit}
            disabled={loading}
            style={[styles.button, loading && styles.buttonDisabled]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>确认绑定</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.footer}>
          本应用仅用于试穿反馈收集，不能替代医疗诊断。如有紧急情况请联系您的服务机构。
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f172a' },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 24,
  },
  hero: { alignItems: 'center', gap: 8 },
  brand: { fontSize: 32, fontWeight: '800', color: '#fff' },
  tagline: { fontSize: 16, color: '#94a3b8' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    gap: 16,
  },
  cardTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  cardDesc: { fontSize: 14, color: '#64748b', lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    letterSpacing: 2,
    textAlign: 'center',
    backgroundColor: '#f8fafc',
  },
  error: { color: '#dc2626', fontSize: 14 },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footer: { color: '#94a3b8', fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
