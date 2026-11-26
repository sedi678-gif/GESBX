package az.gesbx.app;

import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

@CapacitorPlugin(name = "CallAudio")
public final class CallAudioPlugin extends Plugin {

    @PluginMethod
    public void setSpeakerEnabled(PluginCall call) {
        Boolean requested = call.getBoolean("enabled");
        final boolean enabled = requested == null || requested;
        getActivity().runOnUiThread(() -> {
            try {
                AudioManager audio = (AudioManager) getContext().getSystemService(android.content.Context.AUDIO_SERVICE);
                if (audio == null) {
                    call.reject("Android audio service is unavailable.");
                    return;
                }

                audio.setMode(AudioManager.MODE_IN_COMMUNICATION);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    int targetType = enabled
                        ? AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                        : AudioDeviceInfo.TYPE_BUILTIN_EARPIECE;
                    List<AudioDeviceInfo> devices = audio.getAvailableCommunicationDevices();
                    for (AudioDeviceInfo device : devices) {
                        if (device.getType() == targetType) {
                            if (audio.setCommunicationDevice(device)) {
                                call.resolve();
                                return;
                            }
                        }
                    }

                    if (!enabled) {
                        audio.clearCommunicationDevice();
                        audio.setSpeakerphoneOn(false);
                        call.resolve();
                        return;
                    }
                    call.reject("Built-in speaker is not available.");
                    return;
                }

                // Android 11 and earlier: route the communication stream through speaker/earpiece.
                audio.setSpeakerphoneOn(enabled);
                call.resolve();
            } catch (Exception error) {
                call.reject("Could not change Android call audio route.", error);
            }
        });
    }

    @PluginMethod
    public void reset(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                AudioManager audio = (AudioManager) getContext().getSystemService(android.content.Context.AUDIO_SERVICE);
                if (audio != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        audio.clearCommunicationDevice();
                    }
                    audio.setSpeakerphoneOn(false);
                    audio.setMode(AudioManager.MODE_NORMAL);
                }
                call.resolve();
            } catch (Exception error) {
                call.reject("Could not restore Android audio mode.", error);
            }
        });
    }
}
