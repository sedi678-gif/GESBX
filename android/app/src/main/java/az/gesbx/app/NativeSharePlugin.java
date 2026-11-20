package az.gesbx.app;

import android.content.Intent;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeShare")
public final class NativeSharePlugin extends Plugin {
    @PluginMethod
    public void share(PluginCall call) {
        String title = call.getString("title", "GEPS X");
        String text = call.getString("text", "");
        String url = call.getString("url", "");
        String payload = (text == null ? "" : text.trim());
        if (url != null && !url.trim().isEmpty() && !payload.contains(url.trim())) {
            payload = payload.isEmpty() ? url.trim() : payload + "\n" + url.trim();
        }
        if (payload.isEmpty()) {
            call.reject("Paylaşmaq üçün mətn və ya bağlantı yoxdur.");
            return;
        }
        try {
            Intent sendIntent = new Intent(Intent.ACTION_SEND);
            sendIntent.setType("text/plain");
            sendIntent.putExtra(Intent.EXTRA_TITLE, title == null ? "GEPS X" : title);
            sendIntent.putExtra(Intent.EXTRA_TEXT, payload);
            Intent chooser = Intent.createChooser(sendIntent, "GEPS X ilə paylaş");
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception error) {
            call.reject("Android paylaşım pəncərəsi açıla bilmədi.", error);
        }
    }
}