package com.wojo.music.protocol

import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject

class SocketClient(
    private val serverUrl: String = ""
) {
    private val socket: Socket = IO.socket(serverUrl, IO.Options().apply {
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

    // Helper: extract first JSONObject arg from a socket.io Ack callback
    private fun firstJsonArg(args: Array<*>): JSONObject? =
        args.firstOrNull() as? JSONObject

    // Helper: build a callback that decodes the first arg into T
    private inline fun <reified T> ackCallback(crossinline cb: (T) -> Unit): (Array<*>) -> Unit = { args ->
        val data = firstJsonArg(args)
        val result = if (data != null) json.decodeFromJson<T>(data.toString()) else null
        if (result != null) cb(result)
    }

    fun connect() {
        if (socket.connected()) return

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
            val data = firstJsonArg(args)
            if (data != null) {
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
            val data = args.firstOrNull() as? JSONArray
            if (data != null) {
                _participants.value = json.decodeListFromJson<Participant>(data.toString())
            }
        }

        socket.on("queue:updated") { args ->
            val data = args.firstOrNull() as? JSONArray
            if (data != null) {
                _queue.value = json.decodeListFromJson<Song>(data.toString())
            }
        }

        socket.on("player:state") { args ->
            val data = firstJsonArg(args)
            if (data != null) {
                _playerState.value = json.decodeFromJson<PlayerState>(data.toString())
            }
        }

        socket.on("player:ended") {
            val prev = _playerState.value
            _playerState.value = prev?.copy(currentSong = null, isPlaying = false)
        }

        socket.on("chat:message") { args ->
            val data = firstJsonArg(args)
            if (data != null) {
                val msg = json.decodeFromJson<ChatMessage>(data.toString())
                _chatMessages.value = _chatMessages.value + msg
            }
        }

        socket.on("chat:system") { args ->
            val message = args.firstOrNull()?.toString() ?: return@on
            val systemMsg = ChatMessage(
                id = System.currentTimeMillis().toString(36),
                sender = "\uD83C\uDFB5 System",
                message = message,
                timestamp = System.currentTimeMillis(),
                isSystem = true
            )
            _chatMessages.value = _chatMessages.value + systemMsg
        }

        socket.on("role:promoted") { args ->
            val data = firstJsonArg(args)
            if (data != null) {
                val role = data.optString("role")
                _myInfo.value = _myInfo.value?.copy(role = role)
            }
        }

        socket.connect()
    }

    fun disconnect() {
        socket.off()
        socket.disconnect()
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

    fun uploadFile(fileBuffer: ByteArray, fileName: String, fileType: String, callback: ((QueueActionResult) -> Unit)? = null) {
        val rid = _roomId.value ?: return
        val ack = callback?.let { ackCallback<QueueActionResult>(it) }
        socket.emit("file:upload", json.encodeToJson(FileUploadPayload(rid, fileBuffer, fileName, fileType)), ack)
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