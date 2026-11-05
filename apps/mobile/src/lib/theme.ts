import { INSTRUMENT_COLOUR, type Instrument } from '@gt/engine';
import { Platform } from 'react-native';

export const C = {
  bg: '#07070D',
  bg2: '#0E0E18',
  panel: '#12121F',
  panel2: '#181828',
  line: 'rgba(255,255,255,0.08)',
  lineStrong: 'rgba(255,255,255,0.16)',
  ink: '#F4F4FB',
  muted: '#8A8AA6',
  gold: '#F5C542',
  goldLo: '#C99A1F',
  goldGlow: 'rgba(245,197,66,0.35)',
  cyan: '#00E5FF',
  pink: '#FF2E88',
  violet: '#A06BFF',
  green: '#38E08A',
  red: '#FF5470',
  onGold: '#20160A',
} as const;

export const instColour = (i: Instrument | undefined): string => (i ? INSTRUMENT_COLOUR[i] : C.ink);

export const F = {
  display: 'SpaceGrotesk_700Bold',
  displaySemi: 'SpaceGrotesk_600SemiBold',
  body: 'Inter_400Regular',
  bodyMed: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
  monoBold: 'JetBrainsMono_700Bold',
} as const;

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const R = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

export const isWeb = Platform.OS === 'web';
export const MAX_WIDTH = 760;
