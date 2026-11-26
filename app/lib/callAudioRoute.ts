import { Capacitor, registerPlugin } from '@capacitor/core';

interface CallAudioPlugin {
  setSpeakerEnabled(options: { enabled: boolean }): Promise<void>;
  reset(): Promise<void>;
}

const NativeCallAudio = registerPlugin<CallAudioPlugin>('CallAudio');

export async function setNativeCallSpeakerEnabled(enabled: boolean): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('CallAudio')) return false;
  try {
    await NativeCallAudio.setSpeakerEnabled({ enabled });
    return true;
  } catch (error) {
    console.warn('[CallAudio] Android audio route switch failed:', error);
    return false;
  }
}

export async function resetNativeCallAudio(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('CallAudio')) return;
  try {
    await NativeCallAudio.reset();
  } catch (error) {
    console.warn('[CallAudio] Android audio mode reset failed:', error);
  }
}
