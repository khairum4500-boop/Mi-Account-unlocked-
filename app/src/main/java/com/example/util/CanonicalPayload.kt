package com.example.util

import dev.rohitverma882.miunlock_account_v2.LoginData
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets

/**
 * Canonical JSON is created exactly once. HEX is derived only from that exact UTF-8 JSON.
 * The decode path validates the bytes and exact string equality before reporting success.
 */
object CanonicalPayload {
    data class Result(
        val json: String,
        val hex: String,
        val decodedJson: String?,
        val isValid: Boolean,
        val errorKey: String? = null
    )

    fun build(login: LoginData): Result =
        build(login.passToken, login.userId, login.deviceId)

    /** Pure-data overload used by JVM unit tests so tests do not require Android framework classes. */
    fun build(passToken: String, userId: String, deviceId: String): Result {
        val missing = when {
            passToken.isBlank() -> "Missing passToken"
            userId.isBlank() -> "Missing userId"
            deviceId.isBlank() -> "Missing deviceId"
            else -> null
        }
        if (missing != null) return Result("", "", null, false, missing)

        val canonicalJson = buildCanonicalJson(passToken, userId, deviceId)
        val utf8: ByteArray
        val hex: String
        try {
            utf8 = canonicalJson.toByteArray(StandardCharsets.UTF_8)
            hex = encodeHex(utf8)
        } catch (e: Exception) {
            return Result(canonicalJson, "", null, false, "HEX encoding error")
        }

        return try {
            val decoded = decodeHexUtf8(hex)
            Result(canonicalJson, hex, decoded, canonicalJson == decoded, if (canonicalJson == decoded) null else "OUTPUT VALIDATION FAILED")
        } catch (e: IllegalArgumentException) {
            Result(canonicalJson, hex, null, false, "HEX decoding error")
        } catch (e: CharacterCodingException) {
            Result(canonicalJson, hex, null, false, "UTF-8 decoding error")
        }
    }

    private fun buildCanonicalJson(passToken: String, userId: String, deviceId: String): String =
        "{\"passToken\":\"${escape(passToken)}\",\"userId\":\"${escape(userId)}\",\"deviceId\":\"${escape(deviceId)}\"}"

    private fun encodeHex(bytes: ByteArray): String =
        bytes.joinToString("") { "%02X".format(it.toInt() and 0xFF) }

    private fun decodeHexUtf8(hex: String): String {
        require(hex.length % 2 == 0 && hex.matches(Regex("[0-9A-Fa-f]*"))) { "Invalid HEX" }
        val bytes = ByteArray(hex.length / 2) { i -> hex.substring(i * 2, i * 2 + 2).toInt(16).toByte() }
        val decoder = StandardCharsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
        return decoder.decode(java.nio.ByteBuffer.wrap(bytes)).toString()
    }

    private fun escape(value: String): String = buildString {
        value.forEach { c ->
            when (c) {
                '\\' -> append("\\\\")
                '"' -> append("\\\"")
                '\b' -> append("\\b")
                '\u000C' -> append("\\f")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> if (c.code < 0x20) append("\\u%04x".format(c.code)) else append(c)
            }
        }
    }
}
