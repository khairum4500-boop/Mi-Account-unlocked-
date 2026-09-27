package com.example

import com.example.util.CanonicalPayload
import dev.rohitverma882.miunlock_account_v2.LoginData
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CanonicalPayloadTest {
    @Test
    fun canonicalJson_hex_roundTrips_exactly_with_unicode_and_escaping() {
        val login = LoginData(
            passToken = "tok-\"বাংলা\n\\", 
            userId = "user-测试",
            deviceId = "device-مرحبا"
        )
        val result = CanonicalPayload.build(login)

        assertTrue(result.isValid)
        assertEquals(
            "{\"passToken\":\"tok-\\\"বাংলা\\n\\\\\",\"userId\":\"user-测试\",\"deviceId\":\"device-مرحبا\"}",
            result.json
        )
        assertEquals(result.json, result.decodedJson)
        assertTrue(result.hex.matches(Regex("[0-9A-F]+")))
    }

    @Test
    fun missing_runtime_value_fails_validation_without_generating_hex() {
        val result = CanonicalPayload.build(LoginData("", "user", "device"))
        assertTrue(!result.isValid)
        assertEquals("", result.hex)
        assertEquals(null, result.decodedJson)
    }
}
