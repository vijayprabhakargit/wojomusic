package com.wojo.music.protocol

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import org.json.JSONObject

object JsonHelper {
    val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true
        coerceInputValues = true
    }

    inline fun <reified T> decodeFromJson(jsonString: String): T =
        json.decodeFromString<T>(jsonString)

    inline fun <reified T> decodeListFromJson(jsonString: String): List<T> =
        json.decodeFromString<List<T>>(jsonString)

    inline fun <reified T> encodeToJson(value: T): JSONObject {
        val string = json.encodeToString(serializer<T>(), value)
        return JSONObject(string)
    }
}