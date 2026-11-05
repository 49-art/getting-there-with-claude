import { LEVELS, type Level } from '@gt/engine';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { GameBoard } from '../../components/GameBoard';
import { Button, Header, Row, Screen, Segmented, T } from '../../components/UI';
import { SAMPLES, usePractice } from '../../game/practice';
import { S } from '../../lib/theme';

export default function Practice() {
  const router = useRouter();
  const { sample } = useLocalSearchParams<{ sample: string }>();
  const [index, setIndex] = useState(Math.min(SAMPLES.length - 1, Math.max(0, Number(sample) || 0)));
  const piece = SAMPLES[index]!;
  const [level, setLevel] = useState<Level>(piece.level);
  return (
    <Screen>
      <Header back kicker="Practice · offline · no chips" title="Practice" />
      <Segmented<number>
        small
        value={index}
        onChange={(i) => {
          setIndex(i);
          setLevel(SAMPLES[i]!.level);
        }}
        options={SAMPLES.map((s, i) => ({ value: i, label: s.text.length > 12 ? `${s.text.slice(0, 11)}…` : s.text }))}
      />
      <View style={{ height: S.sm }} />
      <Segmented<Level> small value={level} onChange={setLevel} options={LEVELS.map((l) => ({ value: l.level, label: `L${l.level}`, sub: l.name }))} />
      <View style={{ height: S.lg }} />
      <PracticeBoard key={`${index}-${level}`} text={piece.text} level={level} onNew={() => router.push('/create')} />
    </Screen>
  );
}

function PracticeBoard({ text, level, onNew }: { text: string; level: Level; onNew: () => void }) {
  const game = usePractice(text, level);
  const done = !game.model.canPlay;
  return (
    <>
      <GameBoard model={game.model} onGuess={game.guess} onSolve={game.solve} onForfeit={game.forfeit} />
      {done ? (
        <Row gap={S.sm} style={{ marginTop: S.lg, flexWrap: 'wrap' }}>
          <Button label="Play again (new key)" icon="restart" onPress={game.reset} />
          <Button label="Post your own" kind="ghost" icon="send" onPress={onNew} />
        </Row>
      ) : (
        <T.muted style={{ marginTop: S.md }}>Practice uses the same rules as live play. The key changes every round.</T.muted>
      )}
    </>
  );
}
