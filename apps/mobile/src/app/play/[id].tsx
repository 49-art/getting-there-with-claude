import { levelSpec } from '@gt/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { release } from '../../audio/sound';
import { ChallengeCard } from '../../components/ChallengeCard';
import { GameBoard, type BoardModel } from '../../components/GameBoard';
import { Banner, Button, Card, ChipAmount, Header, Loading, Row, Screen, Section, T } from '../../components/UI';
import { ApiError, api, type ChallengeView, type MoveResponse } from '../../lib/api';
import { STATUS_LABEL, ago } from '../../lib/format';
import { useSession } from '../../lib/session';
import { C, F, S } from '../../lib/theme';

function confirm(title: string, body: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' ? window.confirm(`${title}\n\n${body}`) : true);
  return new Promise((resolve) =>
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Continue', onPress: () => resolve(true) },
    ]),
  );
}

export default function Play() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { signedIn, me } = useSession();
  const [error, setError] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['challenge', id], queryFn: () => api<ChallengeView>(`/challenges/${id}`), enabled: !!id });
  const c = q.data;

  // Free the audio players for this challenge's notes when leaving it.
  const soundRefs = (c?.tokens ?? []).map((t) => ('s' in t ? t.s : '')).filter(Boolean).join(' ');
  useEffect(() => () => release(soundRefs.split(' ').filter(Boolean)), [soundRefs]);

  const setView = (v: ChallengeView) => qc.setQueryData(['challenge', id], v);
  const onError = (e: unknown) => {
    setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    if (e instanceof ApiError && (e.code === 'conflict' || e.code === 'invalid_move')) void q.refetch();
  };
  const after = () => {
    setError(null);
    void qc.invalidateQueries({ queryKey: ['me'] });
    void qc.invalidateQueries({ queryKey: ['inbox'] });
  };

  const accept = useMutation({ mutationFn: () => api<ChallengeView>(`/challenges/${id}/accept`, { body: {} }), onSuccess: (v) => (setView(v), after()), onError });
  const guess = useMutation({ mutationFn: (letter: string) => api<MoveResponse>(`/challenges/${id}/guess`, { body: { letter } }), onSuccess: (r) => (setView(r.challenge), after()), onError });
  const solve = useMutation({ mutationFn: (attempt: string) => api<MoveResponse>(`/challenges/${id}/solve`, { body: { attempt } }), onSuccess: (r) => (setView(r.challenge), after()), onError });
  const forfeit = useMutation({ mutationFn: () => api<ChallengeView>(`/challenges/${id}/forfeit`, { body: {} }), onSuccess: (v) => (setView(v), after()), onError });
  const withdraw = useMutation({ mutationFn: () => api<ChallengeView>(`/challenges/${id}/withdraw`, { body: {} }), onSuccess: (v) => (setView(v), after()), onError });

  if (q.isPending) return <Screen><Header back title="Challenge" /><Loading /></Screen>;
  if (q.error || !c)
    return (
      <Screen>
        <Header back title="Challenge" />
        <Banner tone="error" text={(q.error as Error)?.message ?? 'Not found.'} />
      </Screen>
    );

  const spec = levelSpec(c.level);
  const busy = guess.isPending || solve.isPending || forfeit.isPending;

  // Before acceptance: the decoder sees the card, never the notes.
  if (c.status === 'open' && c.role !== 'coder') {
    return (
      <Screen>
        <Header back kicker={c.direct ? `From @${c.coder.username}` : 'Open challenge'} title="Ready to decode?" />
        <ChallengeCard c={c} />
        <Card style={{ marginTop: S.lg }}>
          <T.label>The deal</T.label>
          <T.body>
            {c.wagered
              ? `Each letter guess or solve attempt costs ${c.guessCost} chip${c.guessCost > 1 ? 's' : ''}, paid to @${c.coder.username}. You have ${c.lives} wrong guesses. Solve it and the ${c.pot}-chip pot is yours.`
              : `A friendly transmission: no chips, ${c.lives} wrong guesses allowed.`}
          </T.body>
          <T.muted style={{ marginTop: S.sm }}>{spec.blurb}</T.muted>
          <T.muted style={{ marginTop: S.sm }}>You have 72 hours once you start; leaving it longer counts as giving up.</T.muted>
        </Card>
        {error ? <Banner tone="error" text={error} /> : null}
        {signedIn ? (
          c.can.accept ? (
            <Button style={{ marginTop: S.lg }} label={c.wagered ? `Accept · balance ${me?.balance ?? 0}` : 'Open transmission'} icon="bolt" loading={accept.isPending} onPress={() => accept.mutate()} />
          ) : (
            <Banner text="This one isn’t open to you." />
          )
        ) : (
          <Button style={{ marginTop: S.lg }} label="Sign in to play" onPress={() => router.push('/welcome')} />
        )}
      </Screen>
    );
  }

  const model: BoardModel | null = c.tokens
    ? {
        level: c.level,
        levelName: c.levelName,
        aids: c.role === 'coder' ? { ...c.aids, staff: true, colours: true, noteNames: true } : c.aids,
        tempo: c.tempo,
        tokens: c.tokens,
        revealed: c.revealed,
        missed: c.missed,
        wrong: c.wrong,
        lives: c.lives,
        status: c.status,
        guessCost: c.guessCost,
        pot: c.pot,
        message: c.message,
        canPlay: c.can.guess,
        actions: c.actions,
        feesPaid: c.feesPaid,
        ratingDelta: c.ratingDelta,
      }
    : null;

  return (
    <Screen refreshing={q.isFetching && !busy} onRefresh={() => void q.refetch()}>
      <Header
        back
        kicker={c.role === 'coder' ? 'Your challenge' : `From @${c.coder.username}`}
        title={c.role === 'coder' ? STATUS_LABEL[c.status] ?? c.status : c.status === 'active' ? 'Decode it' : STATUS_LABEL[c.status] ?? c.status}
      />

      {c.role === 'coder' ? <CoderPanel c={c} onWithdraw={async () => (await confirm('Withdraw?', 'The pot returns to your bank.')) && withdraw.mutate()} withdrawing={withdraw.isPending} /> : null}

      {model ? (
        <GameBoard
          model={model}
          busy={busy}
          error={error}
          onGuess={async (l) => {
            const r = await guess.mutateAsync(l).catch(() => null);
            return r ? r.result.hit : undefined;
          }}
          onSolve={async (a) => {
            const ok = await confirm('Submit your answer?', c.wagered ? `Costs ${c.guessCost} chip${c.guessCost > 1 ? 's' : ''}. A wrong answer costs 2 lives.` : 'A wrong answer costs 2 lives.');
            if (!ok) return undefined;
            const r = await solve.mutateAsync(a).catch(() => null);
            return r ? r.result.hit : undefined;
          }}
          onForfeit={c.can.forfeit ? async () => (await confirm('Give up?', c.wagered ? 'The pot goes back to the coder and your rating drops.' : 'The answer will be revealed.')) && forfeit.mutate() : undefined}
        />
      ) : (
        <Banner text="Nothing to show yet." />
      )}
    </Screen>
  );
}

function CoderPanel({ c, onWithdraw, withdrawing }: { c: ChallengeView; onWithdraw: () => void; withdrawing: boolean }) {
  return (
    <Card style={{ marginBottom: S.lg }} accent={C.goldGlow}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View>
          <T.label>Your message</T.label>
          <Text style={st.msg} selectable>
            {c.message}
          </Text>
          <T.muted>Key k = {c.key} · posted {ago(c.createdAt)}</T.muted>
        </View>
        {c.pot > 0 ? <ChipAmount n={c.pot} size={22} /> : null}
      </Row>
      <Section title="Progress">
        {c.status === 'open' ? (
          <>
            <T.body>{c.direct ? `Waiting for @${c.recipient?.username} to open it.` : 'Waiting in the lobby for a decoder.'}</T.body>
            <Button style={{ marginTop: S.md }} kind="danger" small label="Withdraw" loading={withdrawing} onPress={onWithdraw} />
          </>
        ) : (
          <T.body>
            {c.decoder ? `@${c.decoder.username}` : 'The decoder'} has made {c.actions} paid move{c.actions === 1 ? '' : 's'} · {c.wrong}/{c.lives} misses · {c.feesPaid} chips earned
            {c.ratingDelta ? ` · rating ${c.ratingDelta > 0 ? '+' : ''}${c.ratingDelta}` : ''}
          </T.body>
        )}
      </Section>
    </Card>
  );
}

const st = StyleSheet.create({
  msg: { fontFamily: F.monoBold, fontSize: 18, color: C.gold, marginVertical: 4, letterSpacing: 1 },
});
