import { noteName, placeOnTreble, type LevelAids, type PublicToken } from '@gt/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { play as playSound, preload } from '../audio/sound';
import { C, F, instColour } from '../lib/theme';
import { GLYPH_UNITS_PER_SPACE, G_CLEF, REST_QUARTER, SHARP } from './glyphs';

export const NOTE_GAP = 64;
const HEIGHT = 220;
const LINE_GAP = 13;
const PLAYHEAD_X = 96;
const BOTTOM_LINE_Y = HEIGHT / 2 + 2 * LINE_GAP;
const yOf = (step: number) => BOTTOM_LINE_Y - step * (LINE_GAP / 2);
const GLYPH_SCALE = LINE_GAP / GLYPH_UNITS_PER_SPACE;
const useNative = Platform.OS !== 'web';

/* ------------------------------------------------------------------ */
/* Playback controller                                                 */
/* ------------------------------------------------------------------ */

export interface Playback {
  scroll: Animated.Value;
  playing: boolean;
  active: number | null;
  speed: number;
  setSpeed: (s: number) => void;
  toggle: () => void;
  restart: () => void;
  jumpTo: (i: number) => void;
  loop: boolean;
  setLoop: (b: boolean) => void;
}

export function usePlayback(tokens: PublicToken[], tempo: number): Playback {
  const [scroll] = useState(() => new Animated.Value(0));
  const [playing, setPlaying] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [speed, setSpeedState] = useState(1);
  const [loop, setLoop] = useState(false);
  // Mutable playback machinery lives in one ref, touched only in handlers and effects.
  const ctl = useRef({
    next: 0,
    timers: [] as ReturnType<typeof setTimeout>[],
    anim: null as Animated.CompositeAnimation | null,
    loop: false,
    start: (_from: number) => {},
  });

  useEffect(() => {
    ctl.current.loop = loop;
  }, [loop]);

  const refs = useMemo(() => tokens.map((t) => ('s' in t ? t.s : undefined)), [tokens]);
  useEffect(() => {
    preload(refs.filter((r): r is string => !!r));
  }, [refs]);

  const beatMs = 60_000 / (tempo * speed);

  const stop = useCallback(() => {
    const c = ctl.current;
    c.timers.forEach(clearTimeout);
    c.timers = [];
    c.anim?.stop();
    c.anim = null;
  }, []);

  const start = useCallback(
    (from: number) => {
      stop();
      const c = ctl.current;
      const n = tokens.length;
      const first = from >= n ? 0 : from;
      c.next = first;
      scroll.setValue(first * NOTE_GAP);
      setPlaying(true);
      for (let j = first; j < n; j++) {
        c.timers.push(
          setTimeout(() => {
            c.next = j + 1;
            setActive(j);
            playSound(refs[j]);
          }, (j - first) * beatMs),
        );
      }
      const a = Animated.timing(scroll, { toValue: n * NOTE_GAP, duration: (n - first) * beatMs, easing: Easing.linear, useNativeDriver: useNative });
      c.anim = a;
      a.start(({ finished }) => {
        if (!finished) return;
        setActive(null);
        c.next = 0;
        if (c.loop) c.start(0);
        else {
          setPlaying(false);
          scroll.setValue(0);
        }
      });
    },
    [beatMs, refs, scroll, stop, tokens.length],
  );

  useEffect(() => {
    ctl.current.start = start;
  }, [start]);
  useEffect(() => stop, [stop]);

  return {
    scroll,
    playing,
    active,
    speed,
    loop,
    setLoop,
    setSpeed: (sp) => {
      const resume = playing;
      stop();
      setPlaying(false);
      setSpeedState(sp);
      if (resume) setTimeout(() => ctl.current.start(ctl.current.next), 0);
    },
    toggle: () => {
      if (playing) {
        stop();
        setPlaying(false);
      } else start(ctl.current.next);
    },
    restart: () => {
      stop();
      setPlaying(false);
      setActive(null);
      ctl.current.next = 0;
      scroll.setValue(0);
    },
    jumpTo: (i) => {
      stop();
      setPlaying(false);
      ctl.current.next = i;
      setActive(i);
      Animated.timing(scroll, { toValue: i * NOTE_GAP, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: useNative }).start();
      playSound(refs[i]);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Stave                                                               */
/* ------------------------------------------------------------------ */

interface StaffProps {
  tokens: PublicToken[];
  aids: LevelAids;
  playback: Playback;
  /** Show every letter (coder preview / resolved). */
  reveal?: boolean;
  height?: number;
}

export function Staff({ tokens, aids, playback, reveal }: StaffProps) {
  const [width, setWidth] = useState(360);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const total = PLAYHEAD_X + tokens.length * NOTE_GAP + width;
  const translateX = useMemo(() => Animated.multiply(playback.scroll, -1), [playback.scroll]);
  const staff = aids.staff;

  return (
    <View style={s.wrap} onLayout={onLayout} accessibilityLabel={`Stave with ${tokens.length} notes`}>
      {/* Bottom layer: stave lines */}
      <Svg width={width} height={HEIGHT} style={StyleSheet.absoluteFill}>
        {staff ? (
          [0, 2, 4, 6, 8].map((st) => <Line key={st} x1={0} x2={width} y1={yOf(st)} y2={yOf(st)} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />)
        ) : (
          <Line x1={0} x2={width} y1={HEIGHT / 2} y2={HEIGHT / 2} stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="2 6" />
        )}
      </Svg>

      {/* Middle layer: the notes scroll past the playhead */}
      <Animated.View style={[s.strip, { width: total, transform: [{ translateX }] }]}>
        <Svg width={total} height={HEIGHT}>
          {tokens.map((t, i) => (
            <TokenGlyph key={i} t={t} x={PLAYHEAD_X + i * NOTE_GAP} aids={aids} active={playback.active === i} reveal={!!reveal} onPress={() => playback.jumpTo(i)} />
          ))}
        </Svg>
      </Animated.View>

      {/* Top layer: clef panel and playhead (taps pass through) */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width={width} height={HEIGHT}>
          {staff ? (
            <>
              <Rect x={0} y={0} width={50} height={HEIGHT} fill="#0A0A14" opacity={0.94} />
              {[0, 2, 4, 6, 8].map((st) => (
                <Line key={st} x1={0} x2={50} y1={yOf(st)} y2={yOf(st)} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
              ))}
              <G transform={`translate(10 ${yOf(2)}) scale(${GLYPH_SCALE})`}>
                <Path d={G_CLEF.d} fill={C.gold} />
              </G>
            </>
          ) : null}
          <Rect x={PLAYHEAD_X - 1} y={16} width={2} height={HEIGHT - 32} fill={C.gold} opacity={0.85} />
          <Path d={`M${PLAYHEAD_X - 6} 12 L${PLAYHEAD_X + 6} 12 L${PLAYHEAD_X} 21 Z`} fill={C.gold} />
        </Svg>
      </View>
    </View>
  );
}

function TokenGlyph({ t, x, aids, active, reveal, onPress }: { t: PublicToken; x: number; aids: LevelAids; active: boolean; reveal: boolean; onPress: () => void }) {
  const hit = <Rect x={x - NOTE_GAP / 2} y={0} width={NOTE_GAP} height={HEIGHT} fill="transparent" onPress={onPress} />;
  if (t.k === 'space') {
    if (!aids.staff) return <G>{hit}</G>;
    return (
      <G>
        <G transform={`translate(${x - 6} ${yOf(4)}) scale(${GLYPH_SCALE})`}>
          <Path d={REST_QUARTER.d} fill="rgba(255,255,255,0.45)" />
        </G>
        {hit}
      </G>
    );
  }
  const open = t.k !== 'letter' || !!t.ch || reveal;
  const colour = aids.colours || open ? instColour(t.i) : C.ink;
  const label = t.ch;
  if (!aids.staff && t.w === undefined) {
    // Audio-only level: a pulse per note, no pitch information.
    return (
      <G>
        <Circle cx={x} cy={HEIGHT / 2} r={active ? 11 : 8} fill={active ? C.gold : 'rgba(255,255,255,0.75)'} />
        {hit}
      </G>
    );
  }
  const w = t.w!;
  if (!aids.staff) {
    // Audio-only level, revealed anchor: show the letter and its pitch name.
    return (
      <G>
        <Circle cx={x} cy={HEIGHT / 2} r={13} fill={colour} opacity={0.2} />
        <SvgText x={x} y={HEIGHT / 2 + 7} fontSize={20} fontFamily={F.display} fontWeight="700" fill={colour} textAnchor="middle">
          {label ?? '•'}
        </SvgText>
        <SvgText x={x} y={HEIGHT / 2 + 36} fontSize={10} fontFamily={F.mono} fill={C.cyan} textAnchor="middle">
          {noteName(w)}
        </SvgText>
        {hit}
      </G>
    );
  }
  const place = placeOnTreble(w);
  const y = yOf(place.step);
  const rx = LINE_GAP * 0.66;
  const ry = LINE_GAP * 0.48;
  const stemX = place.stemUp ? x + rx - 1 : x - rx + 1;
  const stemY2 = place.stemUp ? y - LINE_GAP * 3.3 : y + LINE_GAP * 3.3;
  const showLetter = open && label;
  return (
    <G>
      {place.ledgers.map((st) => (
        <Line key={st} x1={x - rx - 6} x2={x + rx + 6} y1={yOf(st)} y2={yOf(st)} stroke="rgba(255,255,255,0.4)" strokeWidth={1.2} />
      ))}
      {place.sharp ? (
        <G transform={`translate(${x - rx - 17} ${y}) scale(${GLYPH_SCALE})`}>
          <Path d={SHARP.d} fill={colour} opacity={0.85} />
        </G>
      ) : null}
      {active ? <Circle cx={x} cy={y} r={LINE_GAP * 1.3} fill={colour} opacity={0.22} /> : null}
      <Line x1={stemX} x2={stemX} y1={y} y2={stemY2} stroke={colour} strokeWidth={1.6} opacity={showLetter ? 0.5 : 0.9} />
      <Ellipse cx={x} cy={y} rx={rx} ry={ry} rotation={-20} originX={x} originY={y} fill={active ? colour : showLetter ? 'rgba(255,255,255,0.12)' : colour} stroke={colour} strokeWidth={1} />
      {showLetter ? (
        <>
          <Circle cx={x} cy={y} r={LINE_GAP * 0.95} fill={C.bg} opacity={0.6} />
          <SvgText x={x} y={y + LINE_GAP * 0.6} fontSize={LINE_GAP * 1.6} fontFamily={F.display} fontWeight="700" fill={colour} textAnchor="middle">
            {label}
          </SvgText>
        </>
      ) : null}
      {aids.noteNames ? (
        <SvgText x={x} y={HEIGHT - 12} fontSize={10} fontFamily={F.mono} fill={C.cyan} opacity={0.8} textAnchor="middle">
          {noteName(w)}
        </SvgText>
      ) : null}
      {hit}
    </G>
  );
}

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

export function Transport({ playback }: { playback: Playback }) {
  return (
    <View style={s.transport}>
      <Pressable accessibilityRole="button" accessibilityLabel={playback.playing ? 'Pause' : 'Play'} onPress={playback.toggle} style={[s.tBtn, s.tPlay]}>
        <Text style={s.tPlayText}>{playback.playing ? '❚❚' : '▶'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Restart" onPress={playback.restart} style={s.tBtn}>
        <Text style={s.tText}>⟲</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Loop" accessibilityState={{ selected: playback.loop }} onPress={() => playback.setLoop(!playback.loop)} style={[s.tBtn, playback.loop && { borderColor: C.gold }]}>
        <Text style={[s.tText, playback.loop && { color: C.gold }]}>↻</Text>
      </Pressable>
      <View style={{ flex: 1 }} />
      {[0.75, 1, 1.35].map((sp) => (
        <Pressable key={sp} accessibilityRole="button" accessibilityState={{ selected: playback.speed === sp }} onPress={() => playback.setSpeed(sp)} style={[s.speed, playback.speed === sp && s.speedOn]}>
          <Text style={[s.speedText, playback.speed === sp && { color: C.onGold }]}>{sp === 0.75 ? 'Slow' : sp === 1 ? 'Normal' : 'Fast'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { height: HEIGHT, borderRadius: 16, overflow: 'hidden', backgroundColor: '#0A0A14', borderWidth: 1, borderColor: C.line },
  strip: { position: 'absolute', left: 0, top: 0, height: HEIGHT },
  transport: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  tBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center' },
  tPlay: { width: 52, height: 52, backgroundColor: C.gold, borderColor: C.gold },
  tPlayText: { color: C.onGold, fontSize: 18, fontFamily: F.display },
  tText: { color: C.ink, fontSize: 20 },
  speed: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: C.line },
  speedOn: { backgroundColor: C.gold, borderColor: C.gold },
  speedText: { fontFamily: F.mono, fontSize: 11, color: C.muted },
});
