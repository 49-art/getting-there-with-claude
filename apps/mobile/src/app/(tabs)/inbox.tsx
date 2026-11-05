import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ChallengeCard } from '../../components/ChallengeCard';
import { Banner, Button, Empty, Header, Loading, Screen, Segmented, T } from '../../components/UI';
import { api, type InboxItem } from '../../lib/api';
import { useSession } from '../../lib/session';
import { C, S } from '../../lib/theme';

export default function Inbox() {
  const router = useRouter();
  const qc = useQueryClient();
  const { signedIn, online } = useSession();
  const [box, setBox] = useState<'received' | 'sent'>('received');
  const q = useQuery({
    queryKey: ['inbox', box],
    enabled: online && signedIn,
    queryFn: () => api<{ items: InboxItem[] }>(`/inbox?box=${box}`),
  });

  if (!signedIn) {
    return (
      <Screen>
        <Header kicker="Transmissions" title="Inbox" />
        <Banner text={online ? 'Sign in to see transmissions sent to you.' : 'The inbox needs a server.'} />
        {online ? <Button label="Get started" onPress={() => router.push('/welcome')} /> : null}
      </Screen>
    );
  }

  return (
    <Screen refreshing={q.isFetching && !q.isPending} onRefresh={() => void qc.invalidateQueries({ queryKey: ['inbox'] })}>
      <Header kicker="Transmissions" title="Inbox" />
      <Segmented
        value={box}
        onChange={setBox}
        options={[
          { value: 'received', label: 'Received' },
          { value: 'sent', label: 'Sent' },
        ]}
      />
      <View style={{ height: S.lg }} />
      {q.isPending ? <Loading /> : null}
      {q.error ? <Banner tone="error" text={(q.error as Error).message} /> : null}
      {q.data && q.data.items.length === 0 ? (
        <Empty
          title={box === 'received' ? 'Nothing here yet' : 'You haven’t sent anything'}
          body={box === 'received' ? 'Transmissions sent to you, and lobby challenges you accept, appear here on every device.' : 'Compose a message and send it to a username or the lobby.'}
          action={box === 'sent' ? <Button small label="Create" onPress={() => router.push('/create')} /> : undefined}
        />
      ) : null}
      <View style={{ gap: S.sm }}>
        {q.data?.items.map((c) => (
          <View key={c.id}>
            <ChallengeCard c={c} mode="inbox" unseen={c.unseen} onPress={() => router.push(`/play/${c.id}`)} />
            {box === 'sent' && c.status === 'active' && c.decoder ? (
              <T.muted style={{ marginTop: 4, marginLeft: 4, color: C.cyan }}>@{c.decoder.username} is decoding · {c.feesPaid} chips earned so far</T.muted>
            ) : null}
          </View>
        ))}
      </View>
    </Screen>
  );
}
