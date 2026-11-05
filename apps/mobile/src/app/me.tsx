import * as Clipboard from 'expo-clipboard';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Banner, Button, Card, ChipAmount, Header, Loading, Row, Screen, Section, Stat, T, TierPill } from '../components/UI';
import { api, type LedgerEntry } from '../lib/api';
import { ago, pct } from '../lib/format';
import { useSession } from '../lib/session';
import { C, F, S } from '../lib/theme';

const KIND: Record<string, string> = {
  starter_grant: 'Welcome chips',
  daily_grant: 'Daily chips',
  escrow_lock: 'Pot escrowed',
  guess_fee: 'Guess fee',
  rake: 'House rake',
  payout: 'Pot won',
  refund: 'Pot returned',
  admin_grant: 'Grant',
};

export default function MeScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { me, signedIn, signOut } = useSession();
  const [newKey, setNewKey] = useState<string | null>(null);
  const bank = useInfiniteQuery({
    queryKey: ['bank'],
    enabled: signedIn,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api<{ balance: number; entries: LedgerEntry[]; next: number | null }>(`/bank${pageParam ? `?before=${pageParam}` : ''}`),
    getNextPageParam: (last) => last.next ?? undefined,
  });
  const daily = useMutation({ mutationFn: () => api('/bank/daily', { body: {} }), onSuccess: () => qc.invalidateQueries() });
  const rotate = useMutation({ mutationFn: () => api<{ recoveryKey: string }>('/auth/rotate-recovery', { body: {} }), onSuccess: (r) => setNewKey(r.recoveryKey) });

  if (!signedIn || !me) {
    return (
      <Screen>
        <Header back title="Profile" />
        <Button label="Sign in" onPress={() => router.replace('/welcome')} />
      </Screen>
    );
  }
  const entries = bank.data?.pages.flatMap((p) => p.entries) ?? [];

  return (
    <Screen>
      <Header back kicker={`${me.entitlements.name} plan`} title={`@${me.username}`} />
      <Card accent={C.goldGlow}>
        <Row style={{ justifyContent: 'space-between' }} gap={S.md}>
          <View style={{ flex: 1 }}>
            <T.label>Chip bank</T.label>
            <ChipAmount n={me.balance} size={30} />
            <T.muted style={{ marginTop: 4 }}>{me.escrowed} in escrow on your live challenges</T.muted>
          </View>
          {me.dailyAvailable ? <Button small label="Daily chips" icon="chip" loading={daily.isPending} onPress={() => daily.mutate()} /> : <T.muted>Daily claimed</T.muted>}
        </Row>
        <T.muted style={{ marginTop: S.md }}>Chips are play-money in this build: nothing is bought or cashed out.</T.muted>
      </Card>

      <Section title="Ratings">
        <Row gap={S.sm}>
          <Card style={{ flex: 1 }}>
            <T.label>Decoder</T.label>
            <Text style={[st.rating, { color: me.decoder.tier.colour }]}>{me.decoder.rating}</Text>
            <TierPill tier={me.decoder.tier.name} />
            <T.muted style={{ marginTop: 6 }}>{me.decoder.games} rated game{me.decoder.games === 1 ? '' : 's'}</T.muted>
          </Card>
          <Card style={{ flex: 1 }}>
            <T.label>Coder</T.label>
            <Text style={[st.rating, { color: me.coder.tier.colour }]}>{me.coder.rating}</Text>
            <TierPill tier={me.coder.tier.name} />
            <T.muted style={{ marginTop: 6 }}>{me.coder.games} rated game{me.coder.games === 1 ? '' : 's'}</T.muted>
          </Card>
        </Row>
        <Row gap={S.sm} style={{ marginTop: S.sm, flexWrap: 'wrap' }}>
          <Stat value={me.stats.solved} label="Solved" color={C.green} />
          <Stat value={pct(me.stats.winRate)} label="Win rate" color={C.cyan} />
          <Stat value={me.stats.bestStreak} label="Best streak" />
          <Stat value={me.stats.chipsWon} label="Chips won" color={C.pink} />
        </Row>
      </Section>

      <Section title="Plan" right={<Button small kind="quiet" label="See plans" onPress={() => router.push('/plans')} />}>
        <Card>
          <T.h2>{me.entitlements.name}</T.h2>
          {me.entitlements.perks.map((p) => (
            <T.muted key={p}>• {p}</T.muted>
          ))}
          {me.planUntil ? <T.muted style={{ marginTop: 6 }}>Until {new Date(me.planUntil).toLocaleDateString()}</T.muted> : null}
        </Card>
      </Section>

      <Section title="Bank statement">
        {bank.isPending ? <Loading /> : null}
        <View style={{ gap: 4 }}>
          {entries.map((e) => (
            <View key={e.id} style={st.entry}>
              <View style={{ flex: 1 }}>
                <Text style={st.kind}>{KIND[e.kind] ?? e.kind}</Text>
                <Text style={st.when}>{ago(e.at)}</Text>
              </View>
              <Text style={[st.delta, { color: e.delta > 0 ? C.green : C.pink }]}>
                {e.delta > 0 ? '+' : ''}
                {e.delta}
              </Text>
            </View>
          ))}
        </View>
        {bank.hasNextPage ? <Button small kind="ghost" label="Older" loading={bank.isFetchingNextPage} onPress={() => bank.fetchNextPage()} style={{ marginTop: S.sm }} /> : null}
      </Section>

      <Section title="Security">
        <Card>
          <T.body>Your recovery key signs you in on other devices. Make a new one if you think someone else has seen it — the old one stops working.</T.body>
          {newKey ? (
            <>
              <Text style={st.key} selectable>
                {newKey}
              </Text>
              <Button small kind="ghost" icon="copy" label="Copy" onPress={() => Clipboard.setStringAsync(newKey)} />
              <Banner tone="warn" text="Save this now. It won’t be shown again." />
            </>
          ) : (
            <Button style={{ marginTop: S.md }} small kind="ghost" label="Make a new recovery key" loading={rotate.isPending} onPress={() => rotate.mutate()} />
          )}
        </Card>
        <Button
          style={{ marginTop: S.lg }}
          kind="danger"
          label="Sign out on this device"
          onPress={async () => {
            await signOut();
            router.replace('/');
          }}
        />
      </Section>
    </Screen>
  );
}

const st = StyleSheet.create({
  rating: { fontFamily: F.display, fontSize: 28, marginBottom: 4 },
  entry: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  kind: { fontFamily: F.bodyMed, color: C.ink, fontSize: 14 },
  when: { fontFamily: F.mono, fontSize: 10.5, color: C.muted, marginTop: 2 },
  delta: { fontFamily: F.display, fontSize: 17 },
  key: { fontFamily: F.monoBold, fontSize: 17, color: C.gold, marginVertical: S.md, letterSpacing: 1 },
});
