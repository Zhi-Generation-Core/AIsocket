import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../config';

export async function getBindingId(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.bindingId);
}

export async function setBindingId(id: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.bindingId, id);
}

export async function clearBindingId(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.bindingId);
}
