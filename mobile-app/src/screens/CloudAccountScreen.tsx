import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import type { CloudSyncStatus } from '../services/supabaseClient';

interface Props {
  syncStatus: CloudSyncStatus;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onContinueLocal: () => void;
}

export function CloudAccountScreen({ syncStatus, onSignIn, onSignUp, onContinueLocal }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busyAction, setBusyAction] = useState<'sign_in' | 'sign_up' | null>(null);

  const submit = async (action: 'sign_in' | 'sign_up') => {
    setBusyAction(action);
    try {
      if (action === 'sign_in') await onSignIn(email, password);
      if (action === 'sign_up') await onSignUp(email, password);
      setPassword('');
    } catch (error) {
      Alert.alert('Account error', error instanceof Error ? error.message : 'Account action failed.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.panel}>
        <View style={styles.iconWrap}>
          <Ionicons name="cloud-upload-outline" size={42} color={colors.brand} />
        </View>
        <Text style={styles.title}>Create your beta account</Text>
        <Text style={styles.body}>
          SubStride saves your beta runs, shoes, load history, and run summaries to your account by default, so your progress is still there when you come back.
        </Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor={colors.textTertiary}
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor={colors.textTertiary}
          />
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => submit('sign_up')}
          disabled={busyAction != null}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>
            {busyAction === 'sign_up' ? 'Creating account...' : 'Create account'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => submit('sign_in')}
          disabled={busyAction != null}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryBtnText}>
            {busyAction === 'sign_in' ? 'Signing in...' : 'Sign in instead'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.syncNote}>{cloudStatusLabel(syncStatus)}</Text>
        <TouchableOpacity style={styles.localBtn} onPress={onContinueLocal} activeOpacity={0.85}>
          <Text style={styles.localBtnText}>Continue local-only for now</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function cloudStatusLabel(status: CloudSyncStatus): string {
  if (status.state === 'syncing') return 'Cloud sync will start after sign-in.';
  if (status.state === 'error') return `Last cloud sync error: ${status.message}`;
  return 'You can sign out later from Settings.';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary, padding: 24, justifyContent: 'center' },
  panel: { gap: 14 },
  iconWrap: {
    width: 82,
    height: 82,
    borderRadius: radius.xl,
    backgroundColor: colors.brandLight,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { fontSize: 25, fontWeight: '800', color: colors.textPrimary },
  body: { fontSize: 15, lineHeight: 22, color: colors.textSecondary },
  form: { gap: 10, marginTop: 4 },
  input: { minHeight: 46, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard, color: colors.textPrimary, fontSize: 15 },
  primaryBtn: { minHeight: 48, borderRadius: radius.md, backgroundColor: colors.brand, justifyContent: 'center', alignItems: 'center' },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: colors.bgCard },
  secondaryBtn: { minHeight: 46, borderRadius: radius.md, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  secondaryBtnText: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  syncNote: { fontSize: 12, lineHeight: 17, color: colors.textTertiary },
  localBtn: { alignItems: 'center', paddingVertical: 8 },
  localBtnText: { fontSize: 13, fontWeight: '700', color: colors.textTertiary },
});
