# Add project specific ProGuard rules here.
# Capacitor resolves native plugins by annotation/reflection.
-keep class az.gesbx.app.PlayIntegrityPlugin { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
