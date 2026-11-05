import { StyleSheet, Text, View } from 'react-native';
import type { Card as CardData } from '../lib/api';
import { STATUS_LABEL, ago, waited } from '../lib/format';
import { C, F, S } from '../lib/theme';
import { Lives } from './GameBoard';
import { Card, ChipAmount, LevelBadge, Pill, Row, Shape, T, TierPill } from './UI';

export function ChallengeCard({ c, onPress, right, mode = 'lobby', unseen }: { c: CardData; onPress?: () => void; right?: React.ReactNode; mode?: 'lobby' | 'live' | 'inbox'; unseen?: boolean }) {
  const statusColour = c.status === 'solved' ? C.green : c.status === 'active' ? C.cyan : c.status === 'open' ? C.gold : C.muted;
  return (
    <Card onPress={onPress} accent={c.coder.highlighted && mode === 'lobby' ? C.goldGlow : undefined}>
      <Row style={{ justifyContent: 'space-between' }} gap={S.sm}>
        <Row gap={S.sm} style={{ flexShrink: 1, flexWrap: 'wrap' }}>
          {unseen ? <View style={st.dot} /> : null}
          <LevelBadge level={c.level} name={c.levelName} />
          {mode !== 'lobby' ? <Pill label={STATUS_LABEL[c.status] ?? c.status} color={statusColour} /> : null}
          {c.coder.highlighted && mode === 'lobby' ? <Pill label={c.coder.plan.toUpperCase()} color={C.gold} filled /> : null}
          {c.direct ? <Pill label="Direct" color={C.violet} /> : null}
        </Row>
        {c.pot > 0 ? <ChipAmount n={c.pot} size={18} /> : <T.muted>Friendly</T.muted>}
      </Row>
      <View style={{ marginVertical: S.md }}>
        <Shape words={c.shape} />
      </View>
      <Row style={{ justifyContent: 'space-between' }} gap={S.sm}>
        <View style={{ flexShrink: 1 }}>
          {mode === 'live' && c.decoder ? (
            <Text style={st.who} numberOfLines={1}>
              @{c.decoder.username} <Text style={st.vs}>vs</Text> @{c.coder.username}
            </Text>
          ) : (
            <Row gap={6}>
              <Text style={st.who} numberOfLines={1}>
                @{c.coder.username}
              </Text>
              <TierPill tier={c.coder.coderTier} />
            </Row>
          )}
          <Text style={st.meta}>
            {mode === 'lobby' ? waited(c.createdAt) : mode === 'live' ? `Last move ${ago(c.lastActionAt)}` : ago(c.resolvedAt ?? c.lastActionAt)}
            {c.wagered ? ` · ${c.guessCost} chip${c.guessCost > 1 ? 's' : ''}/guess` : ''} · {c.letterCount} letters
          </Text>
        </View>
        {right ?? (mode === 'live' || c.status === 'active' ? <Lives left={c.livesLeft} total={c.lives} /> : <Text style={st.lives}>{c.lives} lives</Text>)}
      </Row>
    </Card>
  );
}

const st = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.pink },
  who: { fontFamily: F.bodySemi, fontSize: 14, color: C.ink },
  vs: { fontFamily: F.mono, fontSize: 11, color: C.muted },
  meta: { fontFamily: F.mono, fontSize: 11, color: C.muted, marginTop: 4 },
  lives: { fontFamily: F.mono, fontSize: 11, color: C.pink },
});
