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

# NewPipeExtractor (uses Rhino for YouTube signature / n-param transforms)
-keep class org.mozilla.javascript.** { *; }
-keep class org.mozilla.classfile.ClassFileWriter
-dontwarn org.mozilla.javascript.tools.**
-dontwarn org.schabi.newpipe.extractor.**
-keep class org.schabi.newpipe.extractor.** { *; }
-keep class com.wojo.music.playback.** { *; }