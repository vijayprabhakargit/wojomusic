package com.wojo.music.protocol

import io.socket.client.Ack
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject

class SocketClient(
    val baseUrl: String = DEFAULT_SERVER_URL
) {
    companion object {
        // Production server. Override for local dev (e.g. http://192.168.0.102:3001).
        const val DEFAULT_SERVER_URL = "https://wojomusic.onrender.com"
    }

    init {
        if (baseUrl.isBlank()) {
            throw Exception("SocketClient: serverUrl must not be empty. Set a valid server URL (e.g., http://192.168.0.102:3001 for local dev)")
        }
    }

    private val socket: Socket = IO.socket(baseUrl, IO.Options().apply {
        transports = arrayOf("websocket", "polling")
        reconnection = true
        reconnectionAttempts = 10
        reconnectionDelay = 1000
    })

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _playerState = MutableStateFlow<PlayerState?>(null)
    val playerState: StateFlow<PlayerState?> = _playerState.asStateFlow()

    private val _queue = MutableStateFlow<List<Song>>(emptyList())
    val queue: StateFlow<List<Song>> = _queue.asStateFlow()

    private val _participants = MutableStateFlow<List<Participant>>(emptyList())
    val participants: StateFlow<List<Participant>> = _participants.asStateFlow()

    private val _chatMessages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val chatMessages: StateFlow<List<ChatMessage>> = _chatMessages.asStateFlow()

    private val _myInfo = MutableStateFlow<Participant?>(null)
    val myInfo: StateFlow<Participant?> = _myInfo.asStateFlow()

    private val _roomId = MutableStateFlow<String?>(null)
    val roomId: StateFlow<String?> = _roomId.asStateFlow()

    private val json = JsonHelper

    @Volatile
    private var listenersRegistered = false

    // Helper: build a Java Ack callback that decodes the first arg into T
    private inline fun <reified T> ackCallback(crossinline cb: (T) -> Unit): Ack = Ack { args: Array<*>? ->
        try {
            val data = args?.firstOrNull() as? JSONObject
            if (data != null) {
                val result = json.decodeFromJson<T>(data.toString())
                cb(result)
            }
        } catch (e: Exception) {
            // If deserialization fails, prevent crash — the ViewModel timeout
            // watcher will eventually clear the loading state and show an error.
        }
    }

    private fun firstJsonArg(args: Array<*>?): JSONObject? {
        val first = args?.firstOrNull() ?: return null
        return when (first) {
            is JSONObject -> first
            is String -> try { JSONObject(first) } catch (e: Exception) { null }
            else -> null
        }
    }

    fun connect() {
        if (socket.connected()) {
            _connectionState.value = ConnectionState.CONNECTED
            return
        }
        if (listenersRegistered) {
            _connectionState.value = ConnectionState.CONNECTING
            socket.connect()
            return
        }
        listenersRegistered = true
        _connectionState.value = ConnectionState.CONNECTING

        socket.on(Socket.EVENT_CONNECT) {
            _connectionState.value = ConnectionState.CONNECTED
        }

        socket.on(Socket.EVENT_DISCONNECT) {
            _connectionState.value = ConnectionState.DISCONNECTED
        }

        socket.on(Socket.EVENT_CONNECT_ERROR) {
            _connectionState.value = ConnectionState.ERROR
        }

        socket.on("room:joined") { args ->
            runCatching {
                val data = firstJsonArg(args) ?: return@runCatching
                val joined = json.decodeFromJson<RoomJoined>(data.toString())
                _roomId.value = joined.roomId
                _myInfo.value = joined.participant
                _participants.value = joined.participants
                _queue.value = joined.queue
                _playerState.value = joined.playerState
                _chatMessages.value = emptyList()
            }
        }

        socket.on("participants:update") { args ->
            runCatching {
                val data = args.firstOrNull() as? JSONArray ?: return@runCatching
                _participants.value = json.decodeListFromJson<Participant>(data.toString())
            }
        }

        socket.on("queue:updated") { args ->
            runCatching {
                val data = args.firstOrNull() as? JSONArray ?: return@runCatching
                _queue.value = json.decodeListFromJson<Song>(data.toString())
            }
        }

        socket.on("player:state") { args ->
            runCatching {
                val data = firstJsonArg(args) ?: return@runCatching
                _playerState.value = json.decodeFromJson<PlayerState>(data.toString())
            }
        }

        socket.on("player:ended") {
            val prev = _playerState.value
            _playerState.value = prev?.copy(currentSong = null, isPlaying = false)
        }

        socket.on("chat:message") { args ->
            runCatching {
                val data = firstJsonArg(args) ?: return@runCatching
                val msg = json.decodeFromJson<ChatMessage>(data.toString())
                _chatMessages.value = _chatMessages.value + msg
            }
        }

        socket.on("chat:system") { args ->
            runCatching {
                val message = args.firstOrNull()?.toString() ?: return@runCatching
                val systemMsg = ChatMessage(
                    id = System.currentTimeMillis().toString(36),
                    sender = "\uD83C\uDFB5 System",
                    message = message,
                    timestamp = System.currentTimeMillis(),
                    isSystem = true
                )
                _chatMessages.value = _chatMessages.value + systemMsg
            }
        }

        socket.on("role:promoted") { args ->
            runCatching {
                val data = firstJsonArg(args) ?: return@runCatching
                val role = data.optString("role")
                if (role.isNotBlank()) {
                    _myInfo.value = _myInfo.value?.copy(role = role)
                    val me = _myInfo.value
                    if (me != null) {
                        _participants.value = _participants.value.map {
                            if (it.name == me.name) it.copy(role = role) else it
                        }
                    }
                }
            }
        }

        socket.connect()
    }

    fun disconnect() {
        socket.off()
        socket.disconnect()
        listenersRegistered = false
        _roomId.value = null
        _myInfo.value = null
        _participants.value = emptyList()
        _queue.value = emptyList()
        _playerState.value = null
        _chatMessages.value = emptyList()
        _connectionState.value = ConnectionState.DISCONNECTED
    }

    // ── Room actions ──

    fun createRoom(name: String, role: String, callback: ((CreateRoomResult) -> Unit)? = null) {
        val ack = callback?.let { ackCallback<CreateRoomResult>(it) }
        socket.emit("room:create", json.encodeToJson(CreateRoomPayload(name, role)), ack)
    }

    fun joinRoom(roomId: String, name: String, role: String, callback: ((JoinRoomResult) -> Unit)? = null) {
        val ack = callback?.let { ackCallback<JoinRoomResult>(it) }
        socket.emit("room:join", json.encodeToJson(JoinRoomPayload(roomId.uppercase(), name, role)), ack)
    }

    fun leaveRoom() {
        val rid = _roomId.value ?: return
        socket.emit("room:leave", json.encodeToJson(RoomIdPayload(rid)))
        _roomId.value = null
        _myInfo.value = null
        _participants.value = emptyList()
        _queue.value = emptyList()
        _playerState.value = null
        _chatMessages.value = emptyList()
    }

    // ── Queue actions ──

    fun addToQueue(song: Song, callback: ((QueueActionResult) -> Unit)? = null) {
        val rid = _roomId.value ?: return
        val ack = callback?.let { ackCallback<QueueActionResult>(it) }
        socket.emit("queue:add", json.encodeToJson(QueueAddPayload(rid, song)), ack)
    }

    fun removeFromQueue(songId: String, callback: ((QueueActionResult) -> Unit)? = null) {
        val rid = _roomId.value ?: return
        val ack = callback?.let { ackCallback<QueueActionResult>(it) }
        socket.emit("queue:remove", json.encodeToJson(QueueRemovePayload(rid, songId)), ack)
    }

    fun reorderQueue(fromIndex: Int, toIndex: Int, callback: ((QueueActionResult) -> Unit)? = null) {
        val rid = _roomId.value ?: return
        val ack = callback?.let { ackCallback<QueueActionResult>(it) }
        socket.emit("queue:reorder", json.encodeToJson(QueueReorderPayload(rid, fromIndex, toIndex)), ack)
    }

    // ── Player controls ──

    fun play() {
        val rid = _roomId.value ?: return
        socket.emit("player:play", json.encodeToJson(RoomIdPayload(rid)))
    }

    fun pause() {
        val rid = _roomId.value ?: return
        socket.emit("player:pause", json.encodeToJson(RoomIdPayload(rid)))
    }

    fun seek(position: Float) {
        val rid = _roomId.value ?: return
        socket.emit("player:seek", json.encodeToJson(SeekPayload(rid, position)))
    }

    fun nextTrack() {
        val rid = _roomId.value ?: return
        socket.emit("player:next", json.encodeToJson(RoomIdPayload(rid)))
    }

    fun prevTrack() {
        val rid = _roomId.value ?: return
        socket.emit("player:previous", json.encodeToJson(RoomIdPayload(rid)))
    }

    fun playFromQueue(index: Int, callback: ((QueueActionResult) -> Unit)? = null) {
        val rid = _roomId.value ?: return
        val ack = callback?.let { ackCallback<QueueActionResult>(it) }
        socket.emit("player:playSpecific", json.encodeToJson(PlaySpecificPayload(rid, index)), ack)
    }

    fun reportProgress(position: Float) {
        val rid = _roomId.value ?: return
        socket.emit("player:progress", json.encodeToJson(ProgressPayload(rid, position)))
    }

    fun syncPosition(position: Float, clientTimestamp: Long) {
        val rid = _roomId.value ?: return
        socket.emit("player:sync", json.encodeToJson(SyncPayload(rid, position, clientTimestamp)))
    }

    // ── Chat ──

    fun sendMessage(message: String) {
        val rid = _roomId.value ?: return
        if (message.isBlank()) return
        socket.emit("chat:message", json.encodeToJson(ChatSendPayload(rid, message.trim())))
    }

    // ── File upload ──
    // The server expects `fileBuffer` to be a real binary attachment (Node Buffer).
    // socket.io's parser deconstructs a nested ByteArray into a binary attachment,
    // so the payload must be built as a JSONObject holding the byte[] directly
    // (not serialized to a JSON array of integers).
    fun uploadFile(fileBuffer: ByteArray, fileName: String, fileType: String, callback: ((FileUploadResult) -> Unit)? = null) {
        val rid = _roomId.value ?: return
        val ack = callback?.let { ackCallback<FileUploadResult>(it) }
        val payload = JSONObject().apply {
            put("roomId", rid)
            put("fileBuffer", fileBuffer)
            put("fileName", fileName)
            put("fileType", fileType)
        }
        socket.emit("file:upload", payload, ack)
    }

    // ── YouTube ──

    fun addYoutube(url: String, callback: ((QueueActionResult) -> Unit)? = null) {
        val rid = _roomId.value ?: return
        val ack = callback?.let { ackCallback<QueueActionResult>(it) }
        socket.emit("youtube:add", json.encodeToJson(YoutubeAddPayload(rid, url)), ack)
    }

    fun isConnected(): Boolean = socket.connected()
    fun rawSocket(): Socket = socket
}

enum class ConnectionState {
    CONNECTED, DISCONNECTED, CONNECTING, ERROR
}
