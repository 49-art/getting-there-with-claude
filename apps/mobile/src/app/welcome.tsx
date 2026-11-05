import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, JellyMark } from '../components/Icon';
import { Banner, Button, Card, Field, Header, Row, Screen, Segmented, T } from '../components/UI';
import { ApiError, api } from '../lib/api';
import { useDebounced } from '../lib/hooks';
import { useSession } from '../lib/session';
import { C, F, S } from '../lib/theme';

const USERNAME = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;

export default function Welcome() {
  const router = useRouter();
  const { register, signIn, online } = useSession();
  const [mode, setMode] = useState<'new' | 'back'>('new');
  const [username, setUsername] = useState('');
  const [recovery, setRecovery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const validName = USERNAME.test(username);
  const checkName = useDebounced(username, 350);
  const availability = useQuery({
    queryKey: ['available', checkName],
    enabled: online && mode === 'new' && USERNAME.test(checkName),
    retry: false,
    queryFn: async () => {
      try {
        return (await api<{ available: boolean }>(`/auth/available?username=${encodeURIComponent(checkName)}`)).available;
      } catch (e) {
        if (e instanceof ApiError && e.code === 'username_taken') return false; // reserved
        throw e;
      }
    },
  });
  const available = checkName === username && availability.data !== undefined ? availability.data : null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'new') {
        const r = await register(username.trim());
        setIssuedKey(r.recoveryKey);
      } else {
        await signIn(username.trim(), recovery);
        router.replace('/');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (issuedKey) {
    return (
      <Screen>
        <Header kicker="Welcome to GT" title={`@${username}`} />
        <Card accent={C.gold}>
          <T.label>Your recovery key</T.label>
          <Text style={st.key} selectable>
            {issuedKey}
          </Text>
          <Button
            kind="ghost"
            small
            icon={copied ? 'check' : 'copy'}
            label={copied ? 'Copied' : 'Copy key'}
            onPress={async () => {
              await Clipboard.setStringAsync(issuedKey);
              setCopied(true);
            }}
          />
          <T.body style={{ marginTop: S.lg }}>This key is how you sign in on another phone or computer. It is shown once and we can’t recover it for you.</T.body>
          <T.muted style={{ marginTop: S.sm }}>Store it in your password manager or write it down. Anyone with your username and this key can use your account.</T.muted>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: saved }} onPress={() => setSaved(!saved)} style={st.check}>
            <View style={[st.box, saved && { backgroundColor: C.gold, borderColor: C.gold }]}>{saved ? <Icon name="check" size={14} color={C.onGold} /> : null}</View>
            <Text style={st.checkText}>I’ve saved my recovery key</Text>
          </Pressable>
        </Card>
        <Button style={{ marginTop: S.lg }} label="Enter the arena" disabled={!saved} onPress={() => router.replace('/')} />
        <T.muted style={{ marginTop: S.sm, textAlign: 'center' }}>100 chips are in your bank to start.</T.muted>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header back title="Get started" />
      <Row gap={S.md} style={{ marginBottom: S.lg }}>
        <JellyMark size={44} />
        <T.muted style={{ flex: 1 }}>One unique username, no email, no password. You get a recovery key to use on your other devices.</T.muted>
      </Row>
      {!online ? <Banner tone="warn" text="No server configured — see PHONE.md." /> : null}
      <Segmented
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
        options={[
          { value: 'new', label: 'I’m new' },
          { value: 'back', label: 'I have a recovery key' },
        ]}
      />
      <View style={{ height: S.lg }} />
      <Field
        label="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        placeholder="e.g. note_runner"
        hint={mode === 'new' ? (validName ? (available === null ? 'Checking…' : available ? 'Available ✓' : 'Taken — try another') : '3–20 letters, numbers or _, starting with a letter') : undefined}
        error={mode === 'new' && available === false ? 'That username is taken.' : null}
      />
      {mode === 'back' ? (
        <Field label="Recovery key" value={recovery} onChangeText={setRecovery} autoCapitalize="characters" autoCorrect={false} placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X" style={{ fontFamily: F.mono }} />
      ) : null}
      {error ? <Banner tone="error" text={error} /> : null}
      <Button
        label={mode === 'new' ? 'Claim username' : 'Sign in'}
        loading={busy}
        disabled={!online || !validName || (mode === 'new' && available === false) || (mode === 'back' && recovery.replace(/[^0-9a-z]/gi, '').length < 26)}
        onPress={submit}
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  key: { fontFamily: F.monoBold, fontSize: 19, letterSpacing: 1.5, color: C.gold, marginVertical: S.md, lineHeight: 28 },
  check: { flexDirection: 'row', alignItems: 'center', gap: S.sm, marginTop: S.lg },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center' },
  checkText: { fontFamily: F.bodyMed, color: C.ink, fontSize: 15 },
});
