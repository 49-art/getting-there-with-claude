import { INSTRUMENT_COLOUR, INSTRUMENT_ROLE, MOTIFS, MOTIF_V2_CHANGES, motifCount, noteName, sampleKey, soundingFor } from '@gt/engine';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { playSequence } from '../audio/sound';
import { Header, Row, Screen, Section, T } from '../components/UI';
import { C, F, R, S } from '../lib/theme';

export default function Motifs() {
  const n = motifCount(MOTIFS);
  return (
    <Screen>
      <Header back kicker={`${n.core} core + ${n.rare} rare`} title="Motif codebook" />
      <T.muted>
        The phrase layer of the cipher: clusters of letters map to short figures, voiced by the family that carries them. Tap any motif to hear it. This is codebook v2 — every figure is unique within its family, and motifs are separated by a rest when played in sequence, so a stream decodes one way only.
      </T.muted>
      <Row gap={S.md} style={{ flexWrap: 'wrap', marginTop: S.md }}>
        {(Object.keys(INSTRUMENT_ROLE) as (keyof typeof INSTRUMENT_ROLE)[]).map((k) => (
          <Row key={k} gap={6}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: INSTRUMENT_COLOUR[k] }} />
            <Text style={st.legend}>
              {k} · {INSTRUMENT_ROLE[k]}
            </Text>
          </Row>
        ))}
      </Row>
      {MOTIFS.map((g) => (
        <Section key={g.group} title={`${g.group} · ${g.inst}`}>
          <View style={st.grid}>
            {g.items.map(([id, cluster, figure]) => (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={`Play motif ${cluster}`}
                onPress={() => figure.length && playSequence(figure.map((m) => sampleKey(g.inst, soundingFor(g.inst, m))), 260)}
                style={({ pressed }) => [st.motif, { borderColor: pressed ? INSTRUMENT_COLOUR[g.inst] : C.line }]}
              >
                <Text style={st.id}>
                  {id}
                  {MOTIF_V2_CHANGES[id] ? ' · v2' : ''}
                </Text>
                <Text style={[st.cluster, { color: INSTRUMENT_COLOUR[g.inst] }]}>{cluster}</Text>
                <Text style={st.notes}>{figure.length ? figure.map(noteName).join(' ') : 'rest'}</Text>
              </Pressable>
            ))}
          </View>
        </Section>
      ))}
    </Screen>
  );
}

const st = StyleSheet.create({
  legend: { fontFamily: F.mono, fontSize: 11, color: C.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  motif: { width: '31.5%', minWidth: 96, flexGrow: 1, backgroundColor: C.panel, borderWidth: 1, borderRadius: R.md, padding: 10 },
  id: { fontFamily: F.mono, fontSize: 9.5, color: C.muted },
  cluster: { fontFamily: F.display, fontSize: 17, marginVertical: 2 },
  notes: { fontFamily: F.mono, fontSize: 10, color: C.cyan },
});
