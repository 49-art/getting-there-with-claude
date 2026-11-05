import { useRouter } from 'expo-router';
import { Button, Empty, Screen } from '../components/UI';

export default function NotFound() {
  const router = useRouter();
  return (
    <Screen>
      <Empty title="That page doesn’t exist" action={<Button label="Go home" onPress={() => router.replace('/')} />} />
    </Screen>
  );
}
