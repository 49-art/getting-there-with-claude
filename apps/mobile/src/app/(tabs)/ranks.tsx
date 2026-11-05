import { TIERS } from '@gt/engine';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Banner, Empty, Header, Loading, Row, Screen, Segmented, T } from '../../components/UI';
import { api } from '../../lib/api';
import { pct } from '../../lib/format';
import { useSession } from '../../lib/session';
import { C, F, R, S } from '../../lib/theme';

type View_ = 'decoders' | 'coders' | 'week' | 'level';
interface RowData {
  rank: number;
  username: string;
  rating: number;
  tier: string;
  solved?: number;
  winRate?: number | null;
  avgLevel?: number | null;
  streak?: number;
  games?: number;
  solves?: number;
  potsWon?: number;
  topLevel?: number;
  solveRateAgainst?: number | null;
  feesEarned?: number;
}

export default function Ranks() {
  const qc = useQueryClient();
  const { me, online } = useSession();
  const [view, setView] = useState<View_>('decoders');
  const [level, setLevel] = useState(1);
  const key = view === 'level' ? `level${level}` : view;
  const q = useQuery({ queryKey: ['scoreboard', key], enabled: online, queryFn: () => api<{ rows: RowData[] }>(`/scoreboard?view=${key}`), refetchInterval: 60_000 });

  return (
    <Screen refreshing={q.isFetching && !q.isPending} onRefresh={() => void qc.invalidateQueries({ queryKey: ['scoreboard'] })}>
      <Header kicker="Live scoreboard" title="Ranks" />
      {!online ? <Banner tone="warn" text="The scoreboard needs a server." /> : null}
      <Segmented<View_>
        small
        value={view}
        onChange={setView}
        options={[
          { value: 'decoders', label: 'Decoders' },
          { value: 'coders', label: 'Coders' },
          { value: 'week', label: 'This week' },
          { value: 'level', label: 'By level' },
        ]}
      />
      {view === 'level' ? (
        <View style={{ marginTop: S.sm }}>
          <Segmented<number> small value={level} onChange={setLevel} options={[1, 2, 3, 4, 5, 6].map((l) => ({ value: l, label: `L${l}` }))} />
        </View>
      ) : null}

      <Row gap={6} style={{ flexWrap: 'wrap', marginTop: S.lg }}>
        {TIERS.map((t) => (
          <View key={t.name} style={[st.tier, { borderColor: t.colour }]}>
            <Text style={[st.tierText, { color: t.colour }]}>{t.name}</Text>
            <Text style={st.tierMin}>{t.min}+</Text>
          </View>
        ))}
      </Row>
      <T.muted style={{ marginTop: S.sm }}>Ratings move only on wagered lobby challenges. Harder levels and stronger coders are worth more.</T.muted>

      {q.isPending && online ? <Loading /> : null}
      {q.data && q.data.rows.length === 0 ? <Empty title="No results yet" body="Solve a wagered lobby challenge to get on the board." /> : null}
      <View style={{ gap: 6, marginTop: S.lg }}>
        {q.data?.rows.map((r) => {
          const mine = r.username === me?.username;
          const colour = TIERS.find((t) => t.name === r.tier)?.colour ?? C.muted;
          return (
            <View key={r.username} style={[st.row, mine && { borderColor: C.gold, backgroundColor: 'rgba(245,197,66,0.06)' }]}>
              <Text style={[st.rank, r.rank <= 3 && { color: C.gold }]}>{r.rank}</Text>
              <View style={{ flex: 1 }}>
                <Text style={st.name} numberOfLines={1}>
                  @{r.username}
                  {mine ? <Text style={{ color: C.gold }}> · you</Text> : null}
                </Text>
                <Text style={st.meta}>
                  {view === 'coders'
                    ? `${r.games} rated · solved against ${pct(r.solveRateAgainst)} · ${r.feesEarned} fees earned`
                    : view === 'decoders'
                      ? `${r.solved} solved · win ${pct(r.winRate)} · avg L${r.avgLevel ? r.avgLevel.toFixed(1) : '—'} · streak ${r.streak}`
                      : `${r.solves} solves · ${r.potsWon} chips in pots · top L${r.topLevel}`}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[st.rating, { color: colour }]}>{r.rating}</Text>
                <Text style={[st.tierSmall, { color: colour }]}>{r.tier}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  tier: { borderWidth: 1, borderRadius: R.sm, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', gap: 6, alignItems: 'baseline' },
  tierText: { fontFamily: F.mono, fontSize: 10.5 },
  tierMin: { fontFamily: F.mono, fontSize: 9, color: C.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: S.md },
  rank: { fontFamily: F.display, fontSize: 18, color: C.muted, width: 30, textAlign: 'center' },
  name: { fontFamily: F.bodySemi, fontSize: 15, color: C.ink },
  meta: { fontFamily: F.mono, fontSize: 10.5, color: C.muted, marginTop: 3 },
  rating: { fontFamily: F.display, fontSize: 20 },
  tierSmall: { fontFamily: F.mono, fontSize: 9.5 },
});
