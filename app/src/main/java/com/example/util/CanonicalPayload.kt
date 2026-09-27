package com.example.util

import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import dev.rohitverma882.miunlock_account_v2.LoginData
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import org.json.JSONException
import org.json.JSONObject

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

    @JsonClass(generateAdapter = true)
    data class LoginPayload(
        val passToken: String,
        val userId: String,
        val deviceId: String
    )

    private val moshi = Moshi.Builder().build()
    private val loginPayloadAdapter = moshi.adapter(LoginPayload::class.java)

    fun build(login: LoginData): Result {
        val missing = when {
            login.passToken.isBlank() -> "Missing passToken"
            login.userId.isBlank() -> "Missing userId"
            login.deviceId.isBlank() -> "Missing deviceId"
            else -> null
        }
        if (missing != null) return Result("", "", null, false, missing)

        val canonicalJson = buildCanonicalJson(login)
        try {
            // Validate the exact canonical string as JSON before deriving HEX.
            val parsed = JSONObject(canonicalJson)
            require(parsed.getString("passToken") == login.passToken)
            require(parsed.getString("userId") == login.userId)
            require(parsed.getString("deviceId") == login.deviceId)
        } catch (e: JSONException) {
            return Result(canonicalJson, "", null, false, "Invalid JSON")
        } catch (e: IllegalArgumentException) {
            return Result(canonicalJson, "", null, false, "Invalid JSON")
        }

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

    private fun buildCanonicalJson(login: LoginData): String =
        loginPayloadAdapter.toJson(
            LoginPayload(
                passToken = login.passToken,
                userId = login.userId,
                deviceId = login.deviceId
            )
        )

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
}
