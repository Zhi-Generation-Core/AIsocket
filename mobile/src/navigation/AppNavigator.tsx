import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { OfflineBanner } from '../components/OfflineBanner';
import { useSession } from '../context/SessionContext';
import type { MainTabParamList, MoreStackParamList, RootStackParamList } from './types';
import { BindScreen } from '../screens/BindScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { PainMapScreen } from '../screens/PainMapScreen';
import { UsageLogScreen } from '../screens/UsageLogScreen';
import { MoreMenuScreen, SettingsScreen } from '../screens/MoreScreen';
import { TimelineScreen } from '../screens/TimelineScreen';
import { VisitFeedbackScreen } from '../screens/VisitFeedbackScreen';
import { EducationScreen } from '../screens/EducationScreen';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const MoreStack = createNativeStackNavigator<MoreStackParamList>();

function MoreStackNavigator() {
  return (
    <MoreStack.Navigator screenOptions={{ headerShown: true, headerBackTitle: '返回' }}>
      <MoreStack.Screen name="MoreMenu" component={MoreMenuScreen} options={{ title: '更多' }} />
      <MoreStack.Screen name="Timeline" component={TimelineScreen} options={{ title: '反馈时间线' }} />
      <MoreStack.Screen
        name="VisitFeedback"
        component={VisitFeedbackScreen}
        options={{ title: '复诊反馈' }}
      />
      <MoreStack.Screen name="Education" component={EducationScreen} options={{ title: '患者教育' }} />
      <MoreStack.Screen name="Settings" component={SettingsScreen} options={{ title: '账户与解绑' }} />
    </MoreStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#64748b',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: '首页' }} />
      <Tab.Screen name="PainMap" component={PainMapScreen} options={{ tabBarLabel: '疼痛' }} />
      <Tab.Screen name="UsageLog" component={UsageLogScreen} options={{ tabBarLabel: '日志' }} />
      <Tab.Screen
        name="More"
        component={MoreStackNavigator}
        options={{ tabBarLabel: '更多', headerShown: false }}
      />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { loading, bindingId } = useSession();

  if (loading) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {bindingId ? (
        <RootStack.Screen name="Main" component={MainShell} />
      ) : (
        <RootStack.Screen name="Bind" component={BindScreen} />
      )}
    </RootStack.Navigator>
  );
}

function MainShell() {
  return (
    <SafeAreaView style={styles.main} edges={['top']}>
      <OfflineBanner />
      <MainTabs />
    </SafeAreaView>
  );
}

export function AppNavigator() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  main: { flex: 1, backgroundColor: '#f8fafc' },
  tabBar: {
    borderTopColor: '#e2e8f0',
    height: 58,
    paddingBottom: 6,
    paddingTop: 6,
  },
  tabBarLabel: { fontSize: 12, fontWeight: '600' },
});
