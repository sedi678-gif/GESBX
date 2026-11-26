import { Capacitor, registerPlugin } from '@capacitor/core';

interface CallAudioPlugin {
  setSpeakerEnabled(options: { enabled: boolean }): Promise<void>;
  reset(): Promise<void>;
}

const NativeCallAudio = registerPlugin<CallAudioPlugin>('CallAudio');

export async function setNativeCallSpeakerEnabled(enabled: boolean): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    await NativeCallAudio.setSpeakerEnabled({ enabled });
  } catch (error) {
    console.warn('[CallAudio] Android audio route switch failed:', error);
  }
}

export async function resetNativeCallAudio(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    await NativeCallAudio.reset();
  } catch (error) {
    console.warn('[CallAudio] Android audio mode reset failed:', error);
  }
}
