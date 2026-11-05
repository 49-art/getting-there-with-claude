import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ChallengeCard } from '../../components/ChallengeCard';
import { Banner, Empty, Header, Loading, Row, Screen, Section, Segmented, Stat, Button } from '../../components/UI';
import { api, type LobbyResponse } from '../../lib/api';
import { useSession } from '../../lib/session';
import { C, S } from '../../lib/theme';

type Sort = 'featured' | 'pot' | 'new' | 'level';

export default function Lobby() {
  const router = useRouter();
  const qc = useQueryClient();
  const { online, signedIn } = useSession();
  const [sort, setSort] = useState<Sort>('featured');
  const [level, setLevel] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000); // keep "waiting" times fresh
    return () => clearInterval(t);
  }, []);
  const q = useQuery({
    queryKey: ['lobby', sort, level],
    enabled: online,
    queryFn: () => api<LobbyResponse>(`/lobby?sort=${sort}${level ? `&level=${level}` : ''}`),
    refetchInterval: 45_000,
  });

  return (
    <Screen refreshing={q.isFetching && !q.isPending} onRefresh={() => void qc.invalidateQueries({ queryKey: ['lobby'] })}>
      <Header kicker="Coders waiting" title="Lobby" />
      {!online ? <Banner tone="warn" text="The lobby needs a server. Practice works offline from Home." /> : null}
      {q.data ? (
        <Row gap={S.sm} style={{ marginBottom: S.lg }}>
          <Stat value={q.data.totals.open} label="Open" />
          <Stat value={q.data.totals.active} label="In play" color={C.cyan} />
          <Stat value={q.data.totals.potsOnTable} label="Chips staked" color={C.green} />
        </Row>
      ) : null}
      <Segmented<Sort>
        small
        value={sort}
        onChange={setSort}
        options={[
          { value: 'featured', label: 'Featured' },
          { value: 'pot', label: 'Biggest pot' },
          { value: 'new', label: 'Newest' },
          { value: 'level', label: 'Hardest' },
        ]}
      />
      <View style={{ height: S.sm }} />
      <Segmented<number> small value={level} onChange={setLevel} options={[{ value: 0, label: 'All' }, ...[1, 2, 3, 4, 5, 6].map((l) => ({ value: l, label: `L${l}` }))]} />

      {q.isPending && online ? <Loading /> : null}
      {q.error ? <Banner tone="error" text={(q.error as Error).message} /> : null}

      <Section title="Open challenges">
        {q.data && q.data.open.length === 0 ? (
          <Empty title="No one is waiting" body="Post the first challenge and set the prize." action={<Button label="Create a challenge" small onPress={() => router.push('/create')} />} />
        ) : null}
        <View style={{ gap: S.sm }}>
          {q.data?.open.map((c) => (
            <ChallengeCard key={c.id} c={c} onPress={() => router.push(signedIn ? `/play/${c.id}` : '/welcome')} />
          ))}
        </View>
      </Section>

      {q.data && q.data.live.length > 0 ? (
        <Section title="Live now">
          <View style={{ gap: S.sm }}>
            {q.data.live.map((c) => (
              <ChallengeCard key={c.id} c={c} mode="live" />
            ))}
          </View>
        </Section>
      ) : null}
    </Screen>
  );
}
