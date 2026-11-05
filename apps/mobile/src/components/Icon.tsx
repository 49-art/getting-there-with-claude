import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { C } from '../lib/theme';

export type IconName = 'home' | 'lobby' | 'create' | 'inbox' | 'ranks' | 'user' | 'play' | 'pause' | 'restart' | 'chip' | 'heart' | 'lock' | 'back' | 'note' | 'bolt' | 'send' | 'check' | 'x' | 'copy' | 'sound' | 'flag';

/** Small stroke icon set drawn with react-native-svg (no icon-font dependency). */
export function Icon({ name, size = 22, color = C.ink, filled = false }: { name: IconName; size?: number; color?: string; filled?: boolean }) {
  const p = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const body = (() => {
    switch (name) {
      case 'home':
        return <Path {...p} d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />;
      case 'lobby':
        return (
          <>
            <Rect {...p} x={4} y={4} width={7} height={7} rx={2} />
            <Rect {...p} x={13} y={4} width={7} height={7} rx={2} />
            <Rect {...p} x={4} y={13} width={7} height={7} rx={2} />
            <Rect {...p} x={13} y={13} width={7} height={7} rx={2} />
          </>
        );
      case 'create':
        return (
          <>
            <Circle {...p} cx={12} cy={12} r={8.5} />
            <Path {...p} d="M12 8v8M8 12h8" />
          </>
        );
      case 'inbox':
        return <Path {...p} d="M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 13h4.5l1.5 2.5h4l1.5-2.5H20" />;
      case 'ranks':
        return <Path {...p} d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />;
      case 'user':
        return (
          <>
            <Circle {...p} cx={12} cy={8} r={4} />
            <Path {...p} d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" />
          </>
        );
      case 'play':
        return <Path {...p} fill={color} d="M8 5.5v13l10.5-6.5z" />;
      case 'pause':
        return <Path {...p} d="M9 6v12M15 6v12" strokeWidth={2.6} />;
      case 'restart':
        return <Path {...p} d="M5 12a7 7 0 1 0 2.2-5.1M5 4v4h4" />;
      case 'chip':
        return (
          <>
            <Circle {...p} cx={12} cy={12} r={8} fill={filled ? color : 'none'} />
            <Circle {...p} cx={12} cy={12} r={4} stroke={filled ? C.onGold : color} />
          </>
        );
      case 'heart':
        return <Path {...p} fill={filled ? color : 'none'} d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />;
      case 'lock':
        return (
          <>
            <Rect {...p} x={5} y={11} width={14} height={9} rx={2} />
            <Path {...p} d="M8 11V8a4 4 0 0 1 8 0v3" />
          </>
        );
      case 'back':
        return <Path {...p} d="M15 5l-7 7 7 7" />;
      case 'note':
        return <Path {...p} d="M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z" />;
      case 'bolt':
        return <Path {...p} d="M13 3L5 14h6l-1 7 8-11h-6z" />;
      case 'send':
        return <Path {...p} d="M4 12l16-8-6 16-2.5-6.5z" />;
      case 'check':
        return <Path {...p} d="M5 12.5l4.5 4.5L19 7.5" />;
      case 'x':
        return <Path {...p} d="M6 6l12 12M18 6L6 18" />;
      case 'copy':
        return (
          <>
            <Rect {...p} x={8} y={8} width={12} height={12} rx={2} />
            <Path {...p} d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
          </>
        );
      case 'sound':
        return <Path {...p} d="M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />;
      case 'flag':
        return <Path {...p} d="M5 21V4M5 4h11l-2 4 2 4H5" />;
    }
  })();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}

/** The GT jellyfish mark from the original prototype. */
export function JellyMark({ size = 36 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path d="M32 6c12 0 20 9 20 21 0 5-3 8-6 8-2 0-3-1-4-3-1 3-3 4-5 4s-4-1-5-4c-1 3-3 4-5 4s-4-1-5-4c-1 2-2 3-4 3-3 0-6-3-6-8C12 15 20 6 32 6Z" fill={C.gold} />
      <Path d="M32 9c-6 0-11 3-14 8 5-3 10-4 14-4s9 1 14 4c-3-5-8-8-14-8Z" fill="#FFE9A8" opacity={0.8} />
      <Path d="M22 36c-1 8 1 14-2 20M28 38c-1 9 0 15-3 22M36 38c1 9 0 15 3 22M42 36c1 8-1 14 2 20M32 39c0 10 0 16 0 23" stroke={C.cyan} strokeWidth={1.8} strokeLinecap="round" fill="none" opacity={0.9} />
    </Svg>
  );
}
