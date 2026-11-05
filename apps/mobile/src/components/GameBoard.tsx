import { MASK, candidatesFor, keyFromReveal, mod, noteName, type Level, type LevelAids, type PublicToken } from '@gt/engine';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, F, R, S, instColour } from '../lib/theme';
import { Icon } from './Icon';
import { Staff, Transport, usePlayback } from './Staff';
import { Banner, Button, Card, ChipAmount, LevelBadge, Row, T } from './UI';

export interface BoardModel {
  level: Level;
  levelName: string;
  aids: LevelAids;
  tempo: number;
  tokens: PublicToken[];
  revealed: string;
  missed: string;
  wrong: number;
  lives: number;
  status: string;
  guessCost: number;
  pot: number;
  message: string | null;
  canPlay: boolean;
  actions?: number;
  feesPaid?: number;
  ratingDelta?: number | null;
}

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const haptic = (kind: 'hit' | 'miss') => {
  if (Platform.OS === 'web') return;
  void Haptics.notificationAsync(kind === 'hit' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
};

export function GameBoard({
  model,
  busy,
  onGuess,
  onSolve,
  onForfeit,
  error,
}: {
  model: BoardModel;
  busy?: boolean;
  onGuess?: (letter: string) => Promise<boolean | void> | boolean | void;
  onSolve?: (attempt: string) => Promise<boolean | void> | boolean | void;
  onForfeit?: () => void;
  error?: string | null;
}) {
  const playback = usePlayback(model.tokens, model.tempo);
  const [attempt, setAttempt] = useState('');
  const livesLeft = Math.max(0, model.lives - model.wrong);
  const resolved = model.status !== 'active' && model.status !== 'open';
  const reveal = resolved || (!!model.message && !model.canPlay);

  const guess = async (l: string) => {
    if (!model.canPlay || busy) return;
    const r = await onGuess?.(l);
    if (r === true) haptic('hit');
    if (r === false) haptic('miss');
  };

  return (
    <View>
      <Row style={{ justifyContent: 'space-between', marginBottom: S.md, flexWrap: 'wrap' }} gap={S.sm}>
        <LevelBadge level={model.level} name={model.levelName} />
        <Row gap={S.md}>
          <Lives left={livesLeft} total={model.lives} />
          {model.pot > 0 ? <ChipAmount n={model.pot} size={15} /> : <T.muted>Friendly</T.muted>}
        </Row>
      </Row>

      <Staff tokens={model.tokens} aids={model.aids} playback={playback} reveal={reveal} />
      <Transport playback={playback} />
      {!model.aids.staff ? <Banner tone="warn" text="Master level: audio only. Listen for pitch and timbre; revealed letters show their pitch as anchors." /> : null}

      <PhraseSlots tokens={model.tokens} active={playback.active} onPress={playback.jumpTo} />

      {model.aids.cipherLab ? <CipherLab tokens={model.tokens} active={playback.active} /> : null}

      {resolved ? <Result model={model} /> : null}

      {error ? <Banner tone="error" text={error} /> : null}

      {model.canPlay ? (
        <>
          <Row style={{ justifyContent: 'space-between', marginTop: S.lg, marginBottom: S.sm }}>
            <T.label style={{ marginBottom: 0 }}>Guess a letter</T.label>
            <T.muted>{model.guessCost > 0 ? `${model.guessCost} chip${model.guessCost > 1 ? 's' : ''} per guess` : 'Free play'}</T.muted>
          </Row>
          <Keyboard revealed={model.revealed} missed={model.missed} disabled={!!busy} onPress={guess} />
          <View style={{ marginTop: S.lg }}>
            <T.label>Know it? Solve the whole phrase</T.label>
            <Row gap={S.sm}>
              <TextInput
                value={attempt}
                onChangeText={setAttempt}
                placeholder="Type the full message"
                placeholderTextColor={C.muted}
                autoCapitalize="characters"
                autoCorrect={false}
                style={st.solveInput}
                onSubmitEditing={() => attempt.trim() && onSolve?.(attempt)}
                accessibilityLabel="Solve attempt"
              />
              <Button label="Solve" small onPress={() => attempt.trim() && onSolve?.(attempt)} disabled={!attempt.trim() || busy} />
            </Row>
            <T.muted style={{ marginTop: 6 }}>A wrong answer costs 2 lives{model.guessCost > 0 ? ` and ${model.guessCost} chip${model.guessCost > 1 ? 's' : ''}` : ''}.</T.muted>
          </View>
          {onForfeit ? (
            <View style={{ marginTop: S.lg }}>
              <Button label="Give up" kind="quiet" small onPress={onForfeit} />
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export function Lives({ left, total }: { left: number; total: number }) {
  return (
    <View accessible accessibilityLabel={`${left} of ${total} lives left`} style={{ flexDirection: 'row', gap: 3 }}>
      {Array.from({ length: total }, (_, i) => (
        <Icon key={i} name="heart" size={14} color={i < left ? C.pink : C.lineStrong} filled={i < left} />
      ))}
    </View>
  );
}

function PhraseSlots({ tokens, active, onPress }: { tokens: PublicToken[]; active: number | null; onPress: (i: number) => void }) {
  type Sounding = Exclude<PublicToken, { k: 'space' }>;
  const words: { t: Sounding; i: number }[][] = [[]];
  tokens.forEach((t, i) => {
    if (t.k === 'space') words.push([]);
    else words[words.length - 1]!.push({ t, i });
  });
  return (
    <View style={st.phrase} accessibilityLabel="Message so far">
      {words
        .filter((w) => w.length)
        .map((w, wi) => (
          <View key={wi} style={st.word}>
            {w.map(({ t, i }) => {
              const ch = t.ch;
              const shown = !!ch;
              const colour = t.k === 'letter' ? (shown ? instColour(t.i) : C.ink) : instColour(t.i);
              return (
                <Pressable key={i} onPress={() => onPress(i)} accessibilityLabel={shown ? `Letter ${ch}` : 'Hidden letter'} style={[st.slot, active === i && { borderColor: C.gold, backgroundColor: 'rgba(245,197,66,0.1)' }, t.k !== 'letter' && { borderBottomColor: 'transparent' }]}>
                  <Text style={[st.slotText, { color: colour }, !shown && { opacity: 0 }]}>{shown ? ch : '·'}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
    </View>
  );
}

function Keyboard({ revealed, missed, disabled, onPress }: { revealed: string; missed: string; disabled: boolean; onPress: (l: string) => void }) {
  return (
    <View style={{ gap: 6 }}>
      {ROWS.map((row) => (
        <View key={row} style={st.kRow}>
          {[...row].map((l) => {
            const hit = revealed.includes(l);
            const miss = missed.includes(l);
            const used = hit || miss;
            return (
              <Pressable
                key={l}
                accessibilityRole="button"
                accessibilityLabel={`Guess ${l}${hit ? ', found' : miss ? ', not in message' : ''}`}
                accessibilityState={{ disabled: used || disabled }}
                onPress={() => !used && !disabled && onPress(l)}
                style={({ pressed }) => [st.key, hit && st.keyHit, miss && st.keyMiss, pressed && !used && { borderColor: C.gold }, disabled && !used && { opacity: 0.6 }]}
              >
                <Text style={[st.keyText, hit && { color: '#04140B' }, miss && { textDecorationLine: 'line-through', color: C.muted }]}>{l}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function keyFromTokens(tokens: PublicToken[]): number | null {
  for (const t of tokens) if (t.k === 'letter' && t.ch && t.i && t.w !== undefined) return keyFromReveal(t.ch, mod(t.w - 60, 12), t.i);
  return null;
}

/** Level 1 teaching aid: the maths under the playhead. */
function CipherLab({ tokens, active }: { tokens: PublicToken[]; active: number | null }) {
  const key = keyFromTokens(tokens);
  const t = active !== null ? tokens[active] : undefined;
  return (
    <Card style={{ marginTop: S.md, backgroundColor: C.bg2 }}>
      <T.label>Cipher Lab — the maths under the playhead</T.label>
      {!t || t.k !== 'letter' || t.w === undefined || !t.i ? (
        <T.muted>
          {t && t.k !== 'letter' ? 'Spaces, punctuation and digits are structural — always shown.' : 'Press play or tap a note. Each letter becomes a pitch: p = ((i − k) + m) mod 12, where i is the letter (A=0), k the secret key (0–11) and m the instrument mask.'}
        </T.muted>
      ) : (
        <View style={{ gap: 4 }}>
          <LabRow k="instrument" v={`${t.i} (m = ${MASK[t.i]})`} colour={instColour(t.i)} />
          <LabRow k="pitch" v={`${noteName(t.w)} → p = ${mod(t.w - 60, 12)}`} colour={C.cyan} />
          {key === null ? (
            <LabRow k="key" v="unknown — reveal one letter and k follows: k = (i + m − p) mod 12" />
          ) : (
            <>
              <LabRow k="key" v={`k = ${key} (from a revealed letter)`} colour={C.gold} />
              <LabRow k="this note is" v={candidatesFor(mod(t.w - 60, 12), key, t.i).join(' or ')} colour={C.gold} />
            </>
          )}
        </View>
      )}
    </Card>
  );
}

const LabRow = ({ k, v, colour = C.ink }: { k: string; v: string; colour?: string }) => (
  <Row style={{ justifyContent: 'space-between' }} gap={S.md}>
    <Text style={st.labK}>{k}</Text>
    <Text style={[st.labV, { color: colour }]}>{v}</Text>
  </Row>
);

function Result({ model }: { model: BoardModel }) {
  const solved = model.status === 'solved';
  const title = solved ? 'Decoded ✓' : model.status === 'withdrawn' ? 'Withdrawn' : model.status === 'expired' ? 'Timed out' : model.status === 'forfeited' ? 'Given up' : 'Out of lives';
  return (
    <Card style={{ marginTop: S.lg, borderColor: solved ? C.green : C.pink, backgroundColor: solved ? 'rgba(56,224,138,0.08)' : 'rgba(255,46,136,0.06)' }}>
      <Text style={[st.resultTitle, { color: solved ? C.green : C.pink }]}>{title}</Text>
      {model.message ? <Text style={st.resultMsg} selectable>{model.message}</Text> : null}
      <Row gap={S.lg} style={{ marginTop: S.md, flexWrap: 'wrap' }}>
        {model.actions !== undefined ? <T.muted>{model.actions} paid action{model.actions === 1 ? '' : 's'}</T.muted> : null}
        {model.feesPaid ? <T.muted>{model.feesPaid} chips in fees</T.muted> : null}
        {model.ratingDelta ? <T.muted style={{ color: model.ratingDelta > 0 ? C.green : C.pink }}>Rating {model.ratingDelta > 0 ? '+' : ''}{model.ratingDelta}</T.muted> : null}
      </Row>
    </Card>
  );
}

const st = StyleSheet.create({
  phrase: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: S.sm, padding: S.md, backgroundColor: C.panel, borderRadius: R.lg, borderWidth: 1, borderColor: C.line },
  word: { flexDirection: 'row', gap: 3 },
  slot: { minWidth: 22, height: 32, alignItems: 'center', justifyContent: 'flex-end', borderBottomWidth: 2, borderBottomColor: C.lineStrong, borderWidth: 1, borderColor: 'transparent', borderRadius: 4, paddingBottom: 2 },
  slotText: { fontFamily: F.display, fontSize: 19 },
  kRow: { flexDirection: 'row', justifyContent: 'center', gap: 5 },
  key: { flex: 1, maxWidth: 46, height: 46, borderRadius: 9, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center' },
  keyHit: { backgroundColor: C.green, borderColor: C.green },
  keyMiss: { opacity: 0.35 },
  keyText: { fontFamily: F.displaySemi, fontSize: 17, color: C.ink },
  solveInput: { flex: 1, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontFamily: F.mono, fontSize: 15 },
  labK: { fontFamily: F.mono, fontSize: 12, color: C.muted },
  labV: { fontFamily: F.mono, fontSize: 12.5, flexShrink: 1, textAlign: 'right' },
  resultTitle: { fontFamily: F.display, fontSize: 22 },
  resultMsg: { fontFamily: F.monoBold, fontSize: 18, color: C.ink, marginTop: S.sm, letterSpacing: 1 },
});
