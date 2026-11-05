import {
  BREAK_EVEN_POT,
  INSTRUMENTS,
  KEY_COUNT,
  LEVELS,
  buildScore,
  describeError,
  letterCount,
  levelSpec,
  newGame,
  projectScore,
  sampleKey,
  validateMessage,
  type Level,
} from '@gt/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Staff, Transport, usePlayback } from '../../components/Staff';
import { Banner, Button, Card, ChipAmount, Field, Header, Row, Screen, Section, Segmented, T } from '../../components/UI';
import { ApiError, api, type ChallengeView } from '../../lib/api';
import { useDebounced } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { C, F, R, S } from '../../lib/theme';

export default function Create() {
  const router = useRouter();
  const qc = useQueryClient();
  const { me, signedIn, online } = useSession();
  const [text, setText] = useState('KEEP BUILDING');
  const [dest, setDest] = useState<'lobby' | 'direct'>('lobby');
  const [recipient, setRecipient] = useState('');
  const [chosenLevel, setLevel] = useState<Level>(2);
  const [wager, setWager] = useState(true);
  const [chosenPot, setPot] = useState(5);
  const [keyMode, setKeyMode] = useState<'random' | 'set'>('random');
  const [key, setKey] = useState(5);
  const [error, setError] = useState<string | null>(null);

  const maxLevel = me?.entitlements.maxLevel ?? 3;
  // Derived, never synced through effects: the level is capped by the plan, the pot by the level.
  const level = Math.min(chosenLevel, maxLevel) as Level;
  const spec = levelSpec(level);
  const potMax = Math.floor(spec.potMax * (me?.entitlements.potMultiplier ?? 1));
  const pot = Math.min(potMax, Math.max(spec.potMin, chosenPot));
  const be = BREAK_EVEN_POT[level];

  const local = validateMessage(text, { wagered: false });
  const debounced = useDebounced(text, 450);
  const remote = useQuery({
    queryKey: ['validate', debounced, wager],
    enabled: online && signedIn && wager && debounced.trim().length > 0,
    queryFn: () => api<{ ok: boolean; errors?: { message: string }[] }>('/challenges/validate', { body: { message: debounced, wagered: true } }),
  });
  const debouncedRecipient = useDebounced(recipient, 300);
  const suggestions = useQuery({
    queryKey: ['users', debouncedRecipient],
    enabled: online && signedIn && dest === 'direct' && debouncedRecipient.length >= 2,
    queryFn: () => api<{ users: { username: string; tier: string }[] }>(`/users/search?q=${encodeURIComponent(debouncedRecipient.toLowerCase())}`),
  });

  const problems = !local.ok ? local.errors.map(describeError) : wager && remote.data && !remote.data.ok ? (remote.data.errors ?? []).map((e) => e.message) : [];

  // Preview: exact for levels 1–3; at 4–6 the secret voice order is drawn when you post.
  const validMessage = local.ok ? local.message : null;
  const previewKey = keyMode === 'set' ? key : 5;
  const preview = useMemo(() => {
    if (!validMessage) return null;
    const n = letterCount(validMessage);
    const voices = levelSpec(level).voices === 'keyed-five' ? Array.from({ length: n }, (_, i) => INSTRUMENTS[(i * 3 + 1) % 5]!) : undefined;
    const score = buildScore(validMessage, previewKey, level, voices);
    return projectScore(score, newGame(), { full: true, soundRef: (inst, midi) => sampleKey(inst, midi) });
  }, [validMessage, previewKey, level]);

  const post = useMutation({
    mutationFn: () =>
      api<ChallengeView>('/challenges', {
        body: { message: text, level, pot: wager ? pot : 0, key: keyMode === 'set' ? key : null, recipient: dest === 'direct' ? recipient.trim() : null },
      }),
    onSuccess: async (c) => {
      setError(null);
      await qc.invalidateQueries();
      router.push(`/play/${c.id}`);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not post the challenge.'),
  });

  if (!online || !signedIn) {
    return (
      <Screen>
        <Header kicker="Compose" title="Create" />
        <Banner tone="info" text={online ? 'Sign in to send transmissions and post wagers.' : 'Creating challenges needs a server. Practice works offline.'} />
        {online ? <Button label="Get started" onPress={() => router.push('/welcome')} /> : null}
      </Screen>
    );
  }

  const canPost = local.ok && problems.length === 0 && (dest === 'lobby' || recipient.trim().length >= 3) && (!wager || (me?.balance ?? 0) >= pot);

  return (
    <Screen>
      <Header kicker="Compose a transmission" title="Create" />

      <Field
        label="Message"
        value={text}
        onChangeText={setText}
        maxLength={80}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="KEEP BUILDING"
        hint={`A–Z, 0–9, space and , . ? ! ' -  ·  ${text.length}/80`}
        error={problems[0] ?? null}
      />

      <T.label>Send to</T.label>
      <Segmented
        value={dest}
        onChange={setDest}
        options={[
          { value: 'lobby', label: 'Open lobby' },
          { value: 'direct', label: 'A specific user' },
        ]}
      />
      {dest === 'direct' ? (
        <View style={{ marginTop: S.md }}>
          <Field label="Recipient username" value={recipient} onChangeText={setRecipient} autoCapitalize="none" autoCorrect={false} placeholder="their_username" />
          {suggestions.data?.users.length ? (
            <Row gap={6} style={{ flexWrap: 'wrap', marginTop: -S.sm, marginBottom: S.md }}>
              {suggestions.data.users.map((u) => (
                <Pressable key={u.username} onPress={() => setRecipient(u.username)} style={st.suggest}>
                  <Text style={st.suggestText}>@{u.username}</Text>
                </Pressable>
              ))}
            </Row>
          ) : null}
          <T.muted>Direct transmissions land in their inbox on every device. They don’t affect ratings.</T.muted>
        </View>
      ) : null}

      <Section title="Difficulty">
        <Segmented<Level>
          value={level}
          onChange={setLevel}
          options={LEVELS.map((l) => ({ value: l.level, label: `L${l.level}`, sub: l.name, locked: l.level > maxLevel }))}
        />
        <T.muted style={{ marginTop: S.sm }}>{spec.blurb}</T.muted>
        <T.muted>
          {spec.lives} lives · {spec.guessCost} chip{spec.guessCost > 1 ? 's' : ''} per guess
          {level > maxLevel ? '' : maxLevel < 6 ? ` · your plan creates up to L${maxLevel}` : ''}
        </T.muted>
      </Section>

      <Section title="Prize pot">
        <Segmented
          value={wager ? 'wager' : 'friendly'}
          onChange={(v) => setWager(v === 'wager')}
          options={[
            { value: 'wager', label: 'Wager chips' },
            { value: 'friendly', label: 'Friendly (no chips)' },
          ]}
        />
        {wager ? (
          <Card style={{ marginTop: S.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Pressable accessibilityLabel="Decrease pot" onPress={() => setPot(Math.max(spec.potMin, pot - 1))} style={st.step}>
                <Text style={st.stepText}>−</Text>
              </Pressable>
              <ChipAmount n={pot} size={30} />
              <Pressable accessibilityLabel="Increase pot" onPress={() => setPot(Math.min(potMax, pot + 1))} style={st.step}>
                <Text style={st.stepText}>+</Text>
              </Pressable>
            </Row>
            <Row gap={6} style={{ justifyContent: 'center', marginTop: S.md, flexWrap: 'wrap' }}>
              {[spec.potMin, Math.min(potMax, be.staveReader), Math.min(potMax, be.wordSolver), potMax]
                .filter((v, i, a) => a.indexOf(v) === i && v >= spec.potMin)
                .map((v) => (
                  <Pressable key={v} onPress={() => setPot(v)} style={[st.quick, pot === v && { borderColor: C.gold }]}>
                    <Text style={st.quickText}>{v}</Text>
                  </Pressable>
                ))}
            </Row>
            <T.muted style={{ marginTop: S.md, textAlign: 'center' }}>
              Range {spec.potMin}–{potMax}. Break-even: about {be.staveReader} against a strong stave reader, {be.wordSolver} against a strong word solver.
              {pot > be.wordSolver ? ' Above that you are paying for a headline prize — expect strong decoders to take it.' : ''}
            </T.muted>
            {(me?.balance ?? 0) < pot ? <Banner tone="error" text={`You have ${me?.balance ?? 0} chips.`} /> : null}
          </Card>
        ) : (
          <T.muted style={{ marginTop: S.sm }}>No chips move. Great for messages to friends and teaching.</T.muted>
        )}
      </Section>

      <Section title="Cipher key">
        <Segmented
          value={keyMode}
          onChange={setKeyMode}
          options={[
            { value: 'random', label: 'Random (secret)' },
            { value: 'set', label: 'Choose' },
          ]}
        />
        {keyMode === 'set' ? (
          <Row style={{ marginTop: S.md, justifyContent: 'center' }} gap={S.lg}>
            <Pressable onPress={() => setKey((k) => (k + KEY_COUNT - 1) % KEY_COUNT)} style={st.step}>
              <Text style={st.stepText}>−</Text>
            </Pressable>
            <Text style={st.keyText}>k = {key}</Text>
            <Pressable onPress={() => setKey((k) => (k + 1) % KEY_COUNT)} style={st.step}>
              <Text style={st.stepText}>+</Text>
            </Pressable>
          </Row>
        ) : null}
        <T.muted style={{ marginTop: S.sm }}>There are 12 keys. Share yours separately if you want the decoder to work the maths.</T.muted>
      </Section>

      {preview ? (
        <Section title="Preview on the stave">
          <PreviewStaff tokens={preview} level={level} />
          <T.muted>
            {keyMode === 'random' ? 'With a random key the real pitches are drawn when you post. ' : ''}
            {spec.voices === 'keyed-five' ? 'At Levels 4–6 the instrument order is also drawn in secret; this shows an example order.' : ''}
          </T.muted>
        </Section>
      ) : null}

      {error ? <Banner tone="error" text={error} /> : null}
      <Button
        style={{ marginTop: S.xl }}
        label={wager ? `Post with ${pot} chip pot` : dest === 'direct' ? 'Send transmission' : 'Post friendly challenge'}
        icon="send"
        loading={post.isPending}
        disabled={!canPost}
        onPress={() => post.mutate()}
      />
      {wager ? <T.muted style={{ marginTop: S.sm, textAlign: 'center' }}>The pot is held in escrow until the challenge resolves. You can withdraw it any time before someone accepts.</T.muted> : null}
    </Screen>
  );
}

function PreviewStaff({ tokens, level }: { tokens: ReturnType<typeof projectScore>; level: Level }) {
  const spec = levelSpec(level);
  const playback = usePlayback(tokens, spec.tempo);
  return (
    <>
      <Staff tokens={tokens} aids={{ ...spec.aids, staff: true, colours: true }} playback={playback} reveal />
      <Transport playback={playback} />
    </>
  );
}

const st = StyleSheet.create({
  step: { width: 46, height: 46, borderRadius: R.md, borderWidth: 1, borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: C.panel2 },
  stepText: { color: C.ink, fontSize: 22, fontFamily: F.display },
  quick: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.pill, borderWidth: 1, borderColor: C.line },
  quickText: { fontFamily: F.mono, fontSize: 12, color: C.ink },
  keyText: { fontFamily: F.display, fontSize: 26, color: C.gold, minWidth: 90, textAlign: 'center' },
  suggest: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.pill, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.line },
  suggestText: { fontFamily: F.mono, fontSize: 12, color: C.cyan },
});
