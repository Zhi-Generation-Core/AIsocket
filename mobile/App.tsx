import { StatusBar } from 'expo-status-bar';
import { SessionProvider } from './src/context/SessionContext';
import { AppNavigator } from './src/navigation/AppNavigator';

export default function App() {
  return (
    <SessionProvider>
      <AppNavigator />
      <StatusBar style="dark" />
    </SessionProvider>
  );
}
