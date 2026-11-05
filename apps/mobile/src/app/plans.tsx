import { View } from 'react-native';
import { Banner, Card, Header, Pill, Row, Screen, T } from '../components/UI';
import { useQuery } from '@tanstack/react-query';
import { api, type ConfigResponse } from '../lib/api';
import { useSession } from '../lib/session';
import { C, S } from '../lib/theme';

export default function Plans() {
  const { me, online } = useSession();
  const q = useQuery({ queryKey: ['config'], enabled: online, queryFn: () => api<ConfigResponse>('/config') });
  return (
    <Screen>
      <Header back kicker="For host coders" title="Plans" />
      <Banner tone="info" text="Billing isn’t switched on in this build, so nothing can be charged. Upgrades are granted by the admin while we’re in preview." />
      <View style={{ gap: S.sm, marginTop: S.md }}>
        {q.data?.plans.map((p) => (
          <Card key={p.plan} accent={me?.plan === p.plan ? C.gold : undefined}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T.h2>{p.name}</T.h2>
              {me?.plan === p.plan ? <Pill label="Current" color={C.gold} filled /> : <T.muted>{p.priceMonthly ? `£${p.priceMonthly}/mo (planned)` : 'Free'}</T.muted>}
            </Row>
            <View style={{ marginTop: S.sm, gap: 2 }}>
              {p.perks.map((k) => (
                <T.muted key={k}>• {k}</T.muted>
              ))}
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
