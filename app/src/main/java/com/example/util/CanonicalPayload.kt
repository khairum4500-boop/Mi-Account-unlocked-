package com.example.util

import dev.rohitverma882.miunlock_account_v2.LoginData
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import org.json.JSONException
import org.json.JSONObject

/**
 * Canonical JSON is created exactly once.
 * HEX is derived only from that exact UTF-8 JSON.
 * The decode path validates UTF-8 and exact string equality.
 */
object CanonicalPayload {

    data class Result(
        val json: String,
        val hex: String,
        val decodedJson: String?,
        val isValid: Boolean,
        val errorKey: String? = null
    )

    fun build(login: LoginData): Result {
        val missing = when {
            login.passToken.isBlank() -> "Missing passToken"
            login.userId.isBlank() -> "Missing userId"
            login.deviceId.isBlank() -> "Missing deviceId"
            else -> null
        }

        if (missing != null) {
            return Result(
                json = "",
                hex = "",
                decodedJson = null,
                isValid = false,
                errorKey = missing
            )
        }

        val canonicalJson = buildCanonicalJson(login)

        try {
            val parsed = JSONObject(canonicalJson)

            require(parsed.getString("passToken") == login.passToken)
            require(parsed.getString("userId") == login.userId)
            require(parsed.getString("deviceId") == login.deviceId)

            require(parsed.length() == 3)
        } catch (_: JSONException) {
            return Result(
                json = canonicalJson,
                hex = "",
                decodedJson = null,
                isValid = false,
                errorKey = "Invalid JSON"
            )
        } catch (_: IllegalArgumentException) {
            return Result(
                json = canonicalJson,
                hex = "",
                decodedJson = null,
                isValid = false,
                errorKey = "Invalid JSON"
            )
        }

        val utf8: ByteArray = try {
            canonicalJson.toByteArray(StandardCharsets.UTF_8)
        } catch (_: Exception) {
            return Result(
                json = canonicalJson,
                hex = "",
                decodedJson = null,
                isValid = false,
                errorKey = "UTF-8 encoding error"
            )
        }

        val hex = try {
            encodeHex(utf8)
        } catch (_: Exception) {
            return Result(
                json = canonicalJson,
                hex = "",
                decodedJson = null,
                isValid = false,
                errorKey = "HEX encoding error"
            )
        }

        return try {
            val decoded = decodeHexUtf8(hex)
            val matches = canonicalJson == decoded

            Result(
                json = canonicalJson,
                hex = hex,
                decodedJson = decoded,
                isValid = matches,
                errorKey = if (matches) null else "OUTPUT VALIDATION FAILED"
            )
        } catch (_: IllegalArgumentException) {
            Result(
                json = canonicalJson,
                hex = hex,
                decodedJson = null,
                isValid = false,
                errorKey = "HEX decoding error"
            )
        } catch (_: CharacterCodingException) {
            Result(
                json = canonicalJson,
                hex = hex,
                decodedJson = null,
                isValid = false,
                errorKey = "UTF-8 decoding error"
            )
        }
    }

    /**
     * Exact canonical key order:
     * passToken
     * userId
     * deviceId
     *
     * JSONObject is used only for JSON escaping/serialization.
     * The final string is assembled explicitly so key order is guaranteed.
     */
    private fun buildCanonicalJson(login: LoginData): String {
        val passToken = JSONObject.quote(login.passToken)
        val userId = JSONObject.quote(login.userId)
        val deviceId = JSONObject.quote(login.deviceId)

        return buildString {
            append("{")
            append("\"passToken\":")
            append(passToken)
            append(",")
            append("\"userId\":")
            append(userId)
            append(",")
            append("\"deviceId\":")
            append(deviceId)
            append("}")
        }
    }

    private fun encodeHex(bytes: ByteArray): String =
        buildString(bytes.size * 2) {
            for (byte in bytes) {
                append("%02X".format(byte.toInt() and 0xFF))
            }
        }

    private fun decodeHexUtf8(hex: String): String {
        require(
            hex.length % 2 == 0 &&
                hex.matches(Regex("[0-9A-Fa-f]*"))
        ) {
            "Invalid HEX"
        }

        val bytes = ByteArray(hex.length / 2)

        for (i in bytes.indices) {
            val start = i * 2
            bytes[i] = hex
                .substring(start, start + 2)
                .toInt(16)
                .toByte()
        }

        val decoder = StandardCharsets.UTF_8
            .newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)

        return decoder
            .decode(ByteBuffer.wrap(bytes))
            .toString()
    }
}
