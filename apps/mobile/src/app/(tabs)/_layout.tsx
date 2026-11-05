import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { Icon, type IconName } from '../../components/Icon';
import { useSession } from '../../lib/session';
import { C, F } from '../../lib/theme';

function TabIcon({ name, color, focused }: { name: IconName; color: unknown; focused: boolean }) {
  return <Icon name={name} size={22} color={focused ? C.gold : String(color)} />;
}

function InboxIcon({ color, focused }: { color: unknown; focused: boolean }) {
  const { me } = useSession();
  const n = me?.unseen ?? 0;
  return (
    <View>
      <Icon name="inbox" size={22} color={focused ? C.gold : String(color)} />
      {n > 0 ? (
        <View style={{ position: 'absolute', top: -4, right: -9, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
          <Text style={{ color: '#fff', fontSize: 10, fontFamily: F.monoBold }}>{n > 9 ? '9+' : n}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.gold,
        tabBarInactiveTintColor: C.muted,
        tabBarStyle: { backgroundColor: C.bg2, borderTopColor: C.line },
        tabBarLabelStyle: { fontFamily: F.mono, fontSize: 10, letterSpacing: 0.5 },
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: (p) => <TabIcon name="home" {...p} /> }} />
      <Tabs.Screen name="lobby" options={{ title: 'Lobby', tabBarIcon: (p) => <TabIcon name="lobby" {...p} /> }} />
      <Tabs.Screen name="create" options={{ title: 'Create', tabBarIcon: (p) => <TabIcon name="create" {...p} /> }} />
      <Tabs.Screen name="inbox" options={{ title: 'Inbox', tabBarIcon: (p) => <InboxIcon {...p} /> }} />
      <Tabs.Screen name="ranks" options={{ title: 'Ranks', tabBarIcon: (p) => <TabIcon name="ranks" {...p} /> }} />
    </Tabs>
  );
}
