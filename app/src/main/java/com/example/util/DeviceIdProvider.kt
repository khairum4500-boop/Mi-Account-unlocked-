package com.example.util

import android.content.Context
import android.provider.Settings
import java.security.MessageDigest
import java.util.UUID

object DeviceIdProvider {

    private const val PREF_NAME = "mi_unlock_device_id_pref"
    private const val KEY_DEVICE_ID = "cached_device_id"

    fun getDeviceId(context: Context): String {
        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        val cached = prefs.getString(KEY_DEVICE_ID, null)
        if (!cached.isNullOrBlank()) {
            return cached
        }

        val generatedId = generateStableId(context)
        prefs.edit().putString(KEY_DEVICE_ID, generatedId).apply()
        return generatedId
    }

    private fun generateStableId(context: Context): String {
        return try {
            val androidId = Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ANDROID_ID
            )
            if (!androidId.isNullOrBlank() && androidId != "9774d56d682e549c") {
                val digest = MessageDigest.getInstance("SHA-256")
                val hash = digest.digest(androidId.toByteArray(Charsets.UTF_8))
                val hexString = hash.joinToString("") { "%02X".format(it) }
                "MI-" + hexString.substring(0, 10)
            } else {
                "MI-" + UUID.randomUUID().toString().replace("-", "").substring(0, 10).uppercase()
            }
        } catch (e: Exception) {
            "MI-" + UUID.randomUUID().toString().replace("-", "").substring(0, 10).uppercase()
        }
    }
}
