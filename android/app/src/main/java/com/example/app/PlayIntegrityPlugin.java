package com.example.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Task;
import com.google.android.play.core.integrity.IntegrityManagerFactory;
import com.google.android.play.core.integrity.StandardIntegrityManager;

@CapacitorPlugin(name = "PlayIntegrity")
public final class PlayIntegrityPlugin extends Plugin {
    private static final long CLOUD_PROJECT_NUMBER = 213802937871L;
    private StandardIntegrityManager.StandardIntegrityTokenProvider tokenProvider;

    @PluginMethod
    public void requestToken(PluginCall call) {
        String requestHash = call.getString("requestHash", "").trim();
        if (requestHash.length() < 16 || requestHash.length() > 500) {
            call.reject("Etibarlı Play Integrity requestHash tələb olunur.");
            return;
        }

        if (tokenProvider != null) {
            requestFromProvider(call, requestHash);
            return;
        }

        try {
            StandardIntegrityManager manager = IntegrityManagerFactory.createStandard(getContext());
            StandardIntegrityManager.PrepareIntegrityTokenRequest prepareRequest =
                StandardIntegrityManager.PrepareIntegrityTokenRequest.builder()
                    .setCloudProjectNumber(CLOUD_PROJECT_NUMBER)
                    .build();
            manager.prepareIntegrityToken(prepareRequest)
                .addOnSuccessListener(provider -> {
                    tokenProvider = provider;
                    requestFromProvider(call, requestHash);
                })
                .addOnFailureListener(error -> call.reject("Play Integrity hazırlana bilmədi.", error));
        } catch (Exception error) {
            call.reject("Play Integrity başladılmadı.", error);
        }
    }

    private void requestFromProvider(PluginCall call, String requestHash) {
        try {
            StandardIntegrityManager.StandardIntegrityTokenRequest tokenRequest =
                StandardIntegrityManager.StandardIntegrityTokenRequest.builder()
                    .setRequestHash(requestHash)
                    .build();
            Task<StandardIntegrityManager.StandardIntegrityToken> task = tokenProvider.request(tokenRequest);
            task.addOnSuccessListener(result -> {
                JSObject response = new JSObject();
                response.put("token", result.token());
                call.resolve(response);
            });
            task.addOnFailureListener(error -> {
                tokenProvider = null;
                call.reject("Play Integrity hökmü alınmadı.", error);
            });
        } catch (Exception error) {
            tokenProvider = null;
            call.reject("Play Integrity sorğusu uğursuz oldu.", error);
        }
    }
}
