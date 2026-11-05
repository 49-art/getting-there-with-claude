import { motifCount, MOTIFS, LEVELS } from '@gt/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, JellyMark } from '../../components/Icon';
import { Banner, Button, Card, ChipAmount, Row, Screen, Section, Stat, T, TierPill } from '../../components/UI';
import { SAMPLES } from '../../game/practice';
import { api, type LobbyResponse } from '../../lib/api';
import { useSession } from '../../lib/session';
import { C, F, R, S } from '../../lib/theme';

export default function Home() {
  const router = useRouter();
  const qc = useQueryClient();
  const { me, signedIn, online, ready } = useSession();
  const lobby = useQuery({ queryKey: ['lobby', 'featured', 0], queryFn: () => api<LobbyResponse>('/lobby'), enabled: online });
  const daily = useMutation({
    mutationFn: () => api<{ granted: number; balance: number }>('/bank/daily', { body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
  const motifs = motifCount(MOTIFS);

  return (
    <Screen refreshing={lobby.isFetching} onRefresh={() => void qc.invalidateQueries()}>
      <Row style={{ justifyContent: 'space-between', marginBottom: S.lg }}>
        <Row gap={S.md}>
          <JellyMark size={38} />
          <View>
            <Text style={st.brand}>
              GT: <Text style={{ color: C.gold }}>GET THIS</Text>
            </Text>
            <Text style={st.tag}>Musical cipher arena</Text>
          </View>
        </Row>
        {signedIn ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Your profile" onPress={() => router.push('/me')} style={st.avatar}>
            <Icon name="user" size={20} color={C.gold} />
          </Pressable>
        ) : null}
      </Row>

      {!online ? <Banner tone="warn" text="Offline mode: no server is configured, so Practice and the motif codebook work but live play doesn't. Set EXPO_PUBLIC_API_URL (see PHONE.md)." /> : null}

      {signedIn && me ? (
        <Card onPress={() => router.push('/me')} accent={C.goldGlow}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T.label>Signed in</T.label>
              <Text style={st.username}>@{me.username}</Text>
              <Row gap={S.sm} style={{ marginTop: 6 }}>
                <TierPill tier={me.decoder.tier.name} />
                <T.muted>{me.decoder.rating} rating</T.muted>
              </Row>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <ChipAmount n={me.balance} size={22} />
              {me.escrowed > 0 ? <T.muted>{me.escrowed} in escrow</T.muted> : null}
            </View>
          </Row>
          {me.dailyAvailable ? (
            <Button style={{ marginTop: S.md }} small label={daily.isPending ? 'Claiming…' : 'Claim your daily chips'} icon="chip" loading={daily.isPending} onPress={() => daily.mutate()} />
          ) : null}
          {me.unseen > 0 ? (
            <Pressable onPress={() => router.push('/inbox')} style={{ marginTop: S.md }}>
              <Text style={{ color: C.pink, fontFamily: F.bodySemi }}>{me.unseen} new in your inbox →</Text>
            </Pressable>
          ) : null}
        </Card>
      ) : ready && online ? (
        <Card accent={C.goldGlow}>
          <T.h2>Claim your username</T.h2>
          <T.muted style={{ marginTop: 4 }}>Pick a unique name, get 100 chips, and start sending musical transmissions to anyone.</T.muted>
          <Button style={{ marginTop: S.md }} label="Get started" icon="bolt" onPress={() => router.push('/welcome')} />
        </Card>
      ) : null}

      <View style={st.hero}>
        <Text style={st.kick}>Cipher · Music · Play</Text>
        <T.h1>
          Messages hidden in <Text style={{ color: C.gold }}>music</Text> you can read.
        </T.h1>
        <T.muted style={{ marginTop: S.md, fontSize: 15, lineHeight: 23 }}>
          Every letter becomes a note on a real stave, played by the instrument its level assigns. Guess the letters, read the pitches, crack the key. The better you read music, the fewer chips you spend.
        </T.muted>
        <Row gap={S.sm} style={{ marginTop: S.lg, flexWrap: 'wrap' }}>
          <Button label="Practice now" icon="play" onPress={() => router.push(`/practice/${0}`)} />
          <Button label="Open lobby" kind="ghost" icon="lobby" onPress={() => router.push('/lobby')} />
        </Row>
      </View>

      <Section title="At a glance">
        <View style={st.grid}>
          <Pressable style={st.cell} onPress={() => router.push('/motifs')}>
            <Stat value={motifs.core + motifs.rare} label="Motifs" />
          </Pressable>
          <View style={st.cell}>
            <Stat value={5} label="Instruments" color={C.cyan} />
          </View>
          <View style={st.cell}>
            <Stat value={LEVELS.length} label="Levels" color={C.pink} />
          </View>
          <Pressable style={st.cell} onPress={() => router.push('/lobby')}>
            <Stat value={lobby.data?.totals.potsOnTable ?? '—'} label="Chips on the table" color={C.green} />
          </Pressable>
        </View>
      </Section>

      <Section title="Practice pieces">
        <View style={{ gap: S.sm }}>
          {SAMPLES.map((s, i) => (
            <Card key={s.text} onPress={() => router.push(`/practice/${i}`)} style={{ paddingVertical: S.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={st.sample}>“{s.text}”</Text>
                <Text style={st.sampleLevel}>L{s.level} · {LEVELS[s.level - 1]!.name}</Text>
              </Row>
            </Card>
          ))}
        </View>
      </Section>

      <Section title="How it works">
        <View style={{ gap: S.sm }}>
          {[
            ['01', 'A letter is a note', 'Each letter A–Z shifts by a secret key (one of 12) and lands on a pitch: p = ((i − k) + m) mod 12. Two or three letters share every pitch, so the melody narrows the answer — it never gives it away.'],
            ['02', 'The stave plays it', 'Notes scroll across a treble stave and sound as they cross the playhead. Reveal one letter and the key follows; from then on every note is down to two or three letters.'],
            ['03', 'Wager and climb', 'Coders post challenges with a prize pot. Decoders pay chips per guess, with limited lives. Solve it and the pot is yours. Every solve moves your rating.'],
          ].map(([n, h, b]) => (
            <Card key={n}>
              <Text style={st.step}>HOW IT WORKS · {n}</Text>
              <T.h2 style={{ marginTop: 6 }}>{h}</T.h2>
              <T.muted style={{ marginTop: 6 }}>{b}</T.muted>
            </Card>
          ))}
        </View>
      </Section>

      <Text style={st.footer}>
        GT: GET THIS · <Text style={{ color: C.gold }}>HVT Innovations</Text>
      </Text>
    </Screen>
  );
}

const st = StyleSheet.create({
  brand: { fontFamily: F.display, fontSize: 18, letterSpacing: 2.2, color: C.ink },
  tag: { fontFamily: F.mono, fontSize: 9.5, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginTop: 2 },
  avatar: { width: 42, height: 42, borderRadius: R.md, borderWidth: 1, borderColor: C.goldGlow, alignItems: 'center', justifyContent: 'center', backgroundColor: C.panel },
  username: { fontFamily: F.display, fontSize: 22, color: C.ink, marginTop: 2 },
  hero: { paddingVertical: S.xl, borderBottomWidth: 1, borderBottomColor: C.line },
  kick: { fontFamily: F.mono, fontSize: 11, letterSpacing: 3, color: C.gold, textTransform: 'uppercase', marginBottom: S.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  cell: { flexBasis: '48%', flexGrow: 1 },
  sample: { fontFamily: F.monoBold, fontSize: 14, color: C.ink, flex: 1 },
  sampleLevel: { fontFamily: F.mono, fontSize: 11, color: C.gold },
  step: { fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.8, color: C.gold },
  footer: { textAlign: 'center', fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: 1, marginTop: S.xxl },
});
