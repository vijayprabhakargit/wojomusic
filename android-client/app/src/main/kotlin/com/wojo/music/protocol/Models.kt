package com.wojo.music.protocol

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName

// ── Inbound models ──

@Serializable
data class PlayerState(
    @SerialName("currentSong") val currentSong: Song? = null,
    @SerialName("currentIndex") val currentIndex: Int = -1,
    @SerialName("isPlaying") val isPlaying: Boolean = false,
    @SerialName("position") val position: Float = 0f,
    @SerialName("lastUpdated") val lastUpdated: Long = 0L
)

@Serializable
data class Song(
    val id: String = "",
    val title: String = "",
    val url: String = "",
    val source: String = "",           // "youtube", "local", "gdrive"
    @SerialName("videoId") val videoId: String? = null,
    val duration: Float = 0f,
    @SerialName("addedBy") val addedBy: String = "",
    @SerialName("streamUrl") val streamUrl: String? = null,
    @SerialName("isYouTubeStream") val isYouTubeStream: Boolean? = null,
    @SerialName("isReady") val isReady: Boolean? = null,
    @SerialName("filePath") val filePath: String? = null,
    @SerialName("isDownloading") val isDownloading: Boolean? = null,
    @SerialName("downloadFailed") val downloadFailed: Boolean? = null
)

@Serializable
data class Participant(
    val id: String = "",
    val name: String = "",
    val role: String = "",             // "admin", "moderator", "listener"
    @SerialName("avatarInitial") val avatarInitial: String? = null,
    @SerialName("isConnected") val isConnected: Boolean = true
)

@Serializable
data class ChatMessage(
    val id: String = "",
    val sender: String = "",
    val message: String = "",
    val timestamp: Long = 0L,
    @SerialName("isSystem") val isSystem: Boolean = false
)

@Serializable
data class RoomJoined(
    @SerialName("roomId") val roomId: String,
    val participant: Participant,
    val participants: List<Participant>,
    val queue: List<Song>,
    @SerialName("playerState") val playerState: PlayerState? = null
)

@Serializable
data class CreateRoomResult(
    val success: Boolean = false,
    val roomId: String? = null,
    val error: String? = null
)

@Serializable
data class JoinRoomResult(
    val success: Boolean = false,
    val error: String? = null
)

@Serializable
data class RolePromoted(
    val role: String
)

@Serializable
data class QueueActionResult(
    val success: Boolean = false,
    val error: String? = null
)

// ── Outbound payload models ──

@Serializable
data class CreateRoomPayload(
    val name: String,
    val role: String
)

@Serializable
data class JoinRoomPayload(
    @SerialName("roomId") val roomId: String,
    val name: String,
    val role: String
)

@Serializable
data class RoomIdPayload(
    @SerialName("roomId") val roomId: String
)

@Serializable
data class QueueAddPayload(
    @SerialName("roomId") val roomId: String,
    val song: Song
)

@Serializable
data class QueueRemovePayload(
    @SerialName("roomId") val roomId: String,
    @SerialName("songId") val songId: String
)

@Serializable
data class QueueReorderPayload(
    @SerialName("roomId") val roomId: String,
    @SerialName("fromIndex") val fromIndex: Int,
    @SerialName("toIndex") val toIndex: Int
)

@Serializable
data class SeekPayload(
    @SerialName("roomId") val roomId: String,
    val position: Float
)

@Serializable
data class PlaySpecificPayload(
    @SerialName("roomId") val roomId: String,
    val index: Int
)

@Serializable
data class ProgressPayload(
    @SerialName("roomId") val roomId: String,
    val position: Float
)

@Serializable
data class SyncPayload(
    @SerialName("roomId") val roomId: String,
    @SerialName("clientPosition") val clientPosition: Float,
    @SerialName("clientTimestamp") val clientTimestamp: Long
)

@Serializable
data class ChatSendPayload(
    @SerialName("roomId") val roomId: String,
    val message: String
)

@Serializable
data class FileUploadPayload(
    @SerialName("roomId") val roomId: String,
    @SerialName("fileBuffer") val fileBuffer: ByteArray,
    @SerialName("fileName") val fileName: String,
    @SerialName("fileType") val fileType: String
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other == null || this::class != other::class) return false
        other as FileUploadPayload
        return roomId == other.roomId && fileName == other.fileName && fileType == other.fileType && fileBuffer.contentEquals(other.fileBuffer)
    }

    override fun hashCode(): Int {
        var result = roomId.hashCode()
        result = 31 * result + fileName.hashCode()
        result = 31 * result + fileType.hashCode()
        result = 31 * result + fileBuffer.contentHashCode()
        return result
    }
}

@Serializable
data class YoutubeAddPayload(
    @SerialName("roomId") val roomId: String,
    val url: String
)