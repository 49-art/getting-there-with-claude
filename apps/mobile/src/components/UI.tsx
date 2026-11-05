import { INSTRUMENT_COLOUR, TIERS } from '@gt/engine';
import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, MAX_WIDTH, R, S } from '../lib/theme';
import { Icon, type IconName } from './Icon';

/* ---------------------------- layout ---------------------------- */

export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  padTop = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  padTop?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const inner = <View style={[styles.inner, { paddingTop: padTop ? insets.top + S.md : S.md, paddingBottom: insets.bottom + S.xxl }]}>{children}</View>;
  if (!scroll) return <View style={styles.screen}>{inner}</View>;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="never"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.gold} /> : undefined}
    >
      {inner}
    </ScrollView>
  );
}

export function Header({ title, kicker, back, right }: { title: string; kicker?: string; back?: boolean; right?: ReactNode }) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      {back ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.backBtn} hitSlop={10}>
          <Icon name="back" size={20} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

export function Section({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ marginTop: S.xl }}>
      {title ? (
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Card({ children, style, onPress, accent }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accent?: string }) {
  const content = <View style={[styles.card, accent ? { borderColor: accent } : null, style]}>{children}</View>;
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [pressed && { opacity: 0.8, transform: [{ scale: 0.995 }] }]}>
      {content}
    </Pressable>
  );
}

export const Row = ({ children, gap = S.sm, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) => <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;

/* ---------------------------- text ---------------------------- */

export const T = {
  h1: (p: { children: ReactNode; style?: StyleProp<TextStyle> }) => <Text style={[styles.h1, p.style]}>{p.children}</Text>,
  h2: (p: { children: ReactNode; style?: StyleProp<TextStyle> }) => <Text style={[styles.h2, p.style]}>{p.children}</Text>,
  body: (p: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) => (
    <Text style={[styles.body, p.style]} numberOfLines={p.numberOfLines}>
      {p.children}
    </Text>
  ),
  muted: (p: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) => (
    <Text style={[styles.muted, p.style]} numberOfLines={p.numberOfLines}>
      {p.children}
    </Text>
  ),
  mono: (p: { children: ReactNode; style?: StyleProp<TextStyle>; selectable?: boolean }) => (
    <Text style={[styles.mono, p.style]} selectable={p.selectable}>
      {p.children}
    </Text>
  ),
  label: (p: { children: ReactNode; style?: StyleProp<TextStyle> }) => <Text style={[styles.label, p.style]}>{p.children}</Text>,
};

/* ---------------------------- controls ---------------------------- */

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  loading,
  disabled,
  small,
  style,
}: {
  label: string;
  onPress?: () => void;
  kind?: 'primary' | 'ghost' | 'danger' | 'quiet';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || loading;
  const colour = kind === 'primary' ? C.onGold : kind === 'danger' ? C.red : C.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      accessibilityLabel={label}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        kind === 'primary' && styles.btnPrimary,
        kind === 'ghost' && styles.btnGhost,
        kind === 'danger' && styles.btnDanger,
        kind === 'quiet' && styles.btnQuiet,
        off && { opacity: 0.45 },
        pressed && !off && { transform: [{ translateY: 1 }], opacity: 0.9 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={colour} size="small" /> : icon ? <Icon name={icon} size={small ? 16 : 18} color={colour} /> : null}
      <Text style={[styles.btnText, small && { fontSize: 13 }, { color: colour }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange, small }: { options: { value: T; label: string; locked?: boolean; sub?: string }[]; value: T; onChange: (v: T) => void; small?: boolean }) {
  return (
    <View style={styles.seg}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="button"
            accessibilityLabel={o.sub ? `${o.label} ${o.sub}` : o.label}
            accessibilityState={{ selected: on, disabled: o.locked }}
            onPress={() => !o.locked && onChange(o.value)}
            style={[styles.segBtn, small && { paddingVertical: 7, paddingHorizontal: 10 }, on && styles.segOn, o.locked && { opacity: 0.4 }]}
          >
            <Row gap={4}>
              {o.locked ? <Icon name="lock" size={12} color={on ? C.onGold : C.muted} /> : null}
              <Text style={[styles.segText, on && { color: C.onGold, fontFamily: F.monoBold }]}>{o.label}</Text>
            </Row>
            {o.sub ? <Text style={[styles.segSub, on && { color: C.onGold }]}>{o.sub}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field(props: TextInputProps & { label?: string; hint?: string; error?: string | null }) {
  const { label, hint, error, style, ...rest } = props;
  return (
    <View style={{ marginBottom: S.lg }}>
      {label ? <T.label>{label}</T.label> : null}
      <TextInput placeholderTextColor={C.muted} {...rest} style={[styles.input, error ? { borderColor: C.red } : null, style]} />
      {error ? <Text style={[styles.hint, { color: C.red }]}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/* ---------------------------- display ---------------------------- */

export function Pill({ label, color = C.muted, filled, icon }: { label: string; color?: string; filled?: boolean; icon?: IconName }) {
  return (
    <View style={[styles.pill, { borderColor: color }, filled && { backgroundColor: color }]}>
      {icon ? <Icon name={icon} size={11} color={filled ? C.bg : color} /> : null}
      <Text style={[styles.pillText, { color: filled ? C.bg : color }]}>{label}</Text>
    </View>
  );
}

const LEVEL_COLOUR = ['#38E08A', '#00E5FF', '#F5C542', '#FF9F43', '#FF2E88', '#A06BFF'];
export const levelColour = (level: number) => LEVEL_COLOUR[(level - 1) % 6]!;

export function LevelBadge({ level, name }: { level: number; name?: string }) {
  return <Pill label={name ? `L${level} · ${name}` : `L${level}`} color={levelColour(level)} />;
}

export function TierPill({ tier }: { tier: string }) {
  const t = TIERS.find((x) => x.name === tier);
  return <Pill label={tier} color={t?.colour ?? C.muted} />;
}

export function ChipAmount({ n, size = 16, color = C.gold }: { n: number; size?: number; color?: string }) {
  return (
    <Row gap={4}>
      <Icon name="chip" size={size} color={color} filled />
      <Text style={{ fontFamily: F.display, fontSize: size, color }}>{n}</Text>
    </Row>
  );
}

export function Stat({ value, label, color = C.gold }: { value: string | number; label: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Icon name="note" size={28} color={C.muted} />
      <Text style={[styles.h2, { textAlign: 'center', marginTop: S.sm }]}>{title}</Text>
      {body ? <Text style={[styles.muted, { textAlign: 'center', marginTop: S.xs }]}>{body}</Text> : null}
      {action ? <View style={{ marginTop: S.lg }}>{action}</View> : null}
    </View>
  );
}

export function Banner({ text, tone = 'info' }: { text: string; tone?: 'info' | 'error' | 'success' | 'warn' }) {
  const colour = tone === 'error' ? C.red : tone === 'success' ? C.green : tone === 'warn' ? C.gold : C.cyan;
  return (
    <View style={[styles.banner, { borderColor: colour }]} accessibilityRole="alert">
      <Text style={[styles.body, { color: colour }]}>{text}</Text>
    </View>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={C.gold} />
      <Text style={[styles.muted, { marginTop: S.sm }]}>{label}</Text>
    </View>
  );
}

export function InstrumentLegend() {
  return (
    <Row gap={S.md} style={{ flexWrap: 'wrap' }}>
      {(Object.keys(INSTRUMENT_COLOUR) as (keyof typeof INSTRUMENT_COLOUR)[]).map((k) => (
        <Row key={k} gap={6}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: INSTRUMENT_COLOUR[k] }} />
          <Text style={styles.legend}>{k}</Text>
        </Row>
      ))}
    </Row>
  );
}

/** Word-shape blanks, e.g. [4, 8] → ▢▢▢▢  ▢▢▢▢▢▢▢▢ */
export function Shape({ words }: { words: number[] }) {
  return (
    <Row gap={10} style={{ flexWrap: 'wrap' }}>
      {words.map((n, i) => (
        <Row key={i} gap={3}>
          {Array.from({ length: n }, (_, j) => (
            <View key={j} style={styles.blank} />
          ))}
        </Row>
      ))}
    </Row>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  inner: { flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: S.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: S.md, marginBottom: S.lg },
  backBtn: { width: 38, height: 38, borderRadius: R.md, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: C.panel },
  kicker: { fontFamily: F.mono, fontSize: 11, letterSpacing: 2.5, color: C.gold, textTransform: 'uppercase', marginBottom: 4 },
  title: { fontFamily: F.display, fontSize: 26, color: C.ink, letterSpacing: -0.3 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: S.md },
  sectionTitle: { fontFamily: F.mono, fontSize: 11, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' },
  card: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: S.lg },
  h1: { fontFamily: F.display, fontSize: 34, lineHeight: 38, color: C.ink, letterSpacing: -0.5 },
  h2: { fontFamily: F.display, fontSize: 18, color: C.ink },
  body: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: C.ink },
  muted: { fontFamily: F.body, fontSize: 13.5, lineHeight: 20, color: C.muted },
  mono: { fontFamily: F.mono, fontSize: 13, color: C.ink },
  label: { fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.6, color: C.muted, textTransform: 'uppercase', marginBottom: S.sm },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.sm, paddingVertical: 14, paddingHorizontal: S.xl, borderRadius: R.md, minHeight: 48 },
  btnSmall: { paddingVertical: 9, paddingHorizontal: S.lg, minHeight: 38 },
  btnPrimary: { backgroundColor: C.gold },
  btnGhost: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.lineStrong },
  btnDanger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.red },
  btnQuiet: { backgroundColor: 'transparent' },
  btnText: { fontFamily: F.displaySemi, fontSize: 15, letterSpacing: 0.2 },
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  segBtn: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: R.sm, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg, alignItems: 'center' },
  segOn: { backgroundColor: C.gold, borderColor: C.gold },
  segText: { fontFamily: F.mono, fontSize: 12, color: C.muted },
  segSub: { fontFamily: F.mono, fontSize: 9.5, color: C.muted, marginTop: 2 },
  input: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 12, fontFamily: F.body, fontSize: 16, color: C.ink },
  hint: { fontFamily: F.body, fontSize: 12.5, color: C.muted, marginTop: 6, lineHeight: 18 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' },
  pillText: { fontFamily: F.mono, fontSize: 10.5, letterSpacing: 0.5 },
  stat: { flex: 1, minWidth: 120, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: S.lg },
  statValue: { fontFamily: F.display, fontSize: 26 },
  statLabel: { fontFamily: F.mono, fontSize: 10, letterSpacing: 1.5, color: C.muted, textTransform: 'uppercase', marginTop: 6 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: S.xxl },
  banner: { borderWidth: 1, borderRadius: R.md, padding: S.md, backgroundColor: C.panel, marginVertical: S.sm },
  legend: { fontFamily: F.mono, fontSize: 11, color: C.muted, textTransform: 'capitalize' },
  blank: { width: 9, height: 12, borderBottomWidth: 2, borderColor: C.lineStrong },
});
