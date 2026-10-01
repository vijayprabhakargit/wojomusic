# Keep Hilt generated classes
-keep class dagger.hilt.** { *; }
-keep class javax.inject.** { *; }
-keep class * extends dagger.hilt.android.internal.managers.ViewComponentManager$FragmentContextWrapper { *; }

# Keep socket.io
-keep class io.socket.** { *; }

# Keep serialization
-keep class kotlinx.serialization.** { *; }

# Keep Ktor
-keep class io.ktor.** { *; }

# Keep Media3/ExoPlayer
-keep class androidx.media3.** { *; }

# Keep our models (serialization)
-keep class com.wojo.music.protocol.** { *; }

# Suppress Android-incompatible Ktor debug detector references
-dontwarn java.lang.management.ManagementFactory
-dontwarn java.lang.management.RuntimeMXBean