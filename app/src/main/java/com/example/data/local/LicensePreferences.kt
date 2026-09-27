package com.example.data.local

import android.content.Context
import android.content.SharedPreferences
import android.os.SystemClock
import com.example.data.model.LicenseStatusResponse
import java.security.MessageDigest

class LicensePreferences(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("mi_unlock_license_prefs", Context.MODE_PRIVATE)

    companion object {
        private const val KEY_BASE_URL = "key_base_url"
        private const val KEY_STATUS = "key_status"
        private const val KEY_LICENSE_ID = "key_license_id"
        private const val KEY_USER_NAME = "key_user_name"
        private const val KEY_CONTACT_NUMBER = "key_contact_number"
        private const val KEY_TELEGRAM_USER = "key_telegram_user"
        private const val KEY_WHATSAPP_NUMBER = "key_whatsapp_number"
        private const val KEY_ACTIVATION_TIME = "key_activation_time"
        private const val KEY_EXPIRATION_TIME = "key_expiration_time"
        private const val KEY_LAST_VERIFIED_TIME = "key_last_verified_time"
        private const val KEY_SERVER_OFFSET = "key_server_offset"
        private const val KEY_SERVER_ANCHOR_TIME = "key_server_anchor_time"
        private const val KEY_SERVER_ANCHOR_ELAPSED = "key_server_anchor_elapsed"
        private const val KEY_REJECTION_REASON = "key_rejection_reason"
        private const val KEY_CHECKSUM = "key_checksum"
        private const val KEY_SUBMITTED_ONCE = "key_submitted_once"

        // Default production backend endpoint
        const val DEFAULT_BASE_URL = "https://mi-account-unlocked.onrender.com/"
    }

    var baseUrl: String
        get() = prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL) ?: DEFAULT_BASE_URL
        set(value) {
            val normalized = if (value.endsWith("/")) value else "$value/"
            prefs.edit().putString(KEY_BASE_URL, normalized).apply()
        }

    var hasSubmittedRequest: Boolean
        get() = prefs.getBoolean(KEY_SUBMITTED_ONCE, false)
        set(value) = prefs.edit().putBoolean(KEY_SUBMITTED_ONCE, value).apply()

    fun saveLicense(response: LicenseStatusResponse) {
        val now = System.currentTimeMillis()
        val checksum = calculateChecksum(
            response.deviceId,
            response.status,
            response.expirationTimestamp ?: 0L
        )

        prefs.edit()
            .putString(KEY_STATUS, response.status)
            .putString(KEY_LICENSE_ID, response.licenseId)
            .putString(KEY_USER_NAME, response.userName)
            .putString(KEY_CONTACT_NUMBER, response.contactNumber)
            .putString(KEY_TELEGRAM_USER, response.telegramUsername)
            .putString(KEY_WHATSAPP_NUMBER, response.whatsappNumber)
            .putLong(KEY_ACTIVATION_TIME, response.activationTimestamp ?: 0L)
            .putLong(KEY_EXPIRATION_TIME, response.expirationTimestamp ?: 0L)
            .putLong("key_duration_seconds", response.durationSeconds ?: 0L)
            .putLong(KEY_LAST_VERIFIED_TIME, now)
            .putLong(KEY_SERVER_OFFSET, (response.serverTime ?: now) - now)
            .putLong(KEY_SERVER_ANCHOR_TIME, response.serverTime ?: now)
            .putLong(KEY_SERVER_ANCHOR_ELAPSED, SystemClock.elapsedRealtime())
            .putString(KEY_REJECTION_REASON, response.rejectionReason)
            .putString(KEY_CHECKSUM, checksum)
            .apply()
    }

    fun getCachedLicense(deviceId: String): LicenseStatusResponse? {
        val status = prefs.getString(KEY_STATUS, null) ?: return null
        val expirationTime = prefs.getLong(KEY_EXPIRATION_TIME, 0L)
        val checksum = prefs.getString(KEY_CHECKSUM, "")

        // Tamper verification
        val expectedChecksum = calculateChecksum(deviceId, status, expirationTime)
        if (checksum != expectedChecksum) {
            return null // Data was tampered
        }

        val lastVerified = prefs.getLong(KEY_LAST_VERIFIED_TIME, 0L)
        val now = trustedNowMillis()

        // If approved but trusted current time is past expiration, mark expired
        val finalStatus = if (status == "APPROVED" && expirationTime in 1..now) {
            "EXPIRED"
        } else {
            status
        }

        val daysRemaining = if (expirationTime > now) {
            (expirationTime - now) / (1000 * 60 * 60 * 24)
        } else 0L

        return LicenseStatusResponse(
            status = finalStatus,
            deviceId = deviceId,
            licenseId = prefs.getString(KEY_LICENSE_ID, null),
            userName = prefs.getString(KEY_USER_NAME, null),
            contactNumber = prefs.getString(KEY_CONTACT_NUMBER, null),
            telegramUsername = prefs.getString(KEY_TELEGRAM_USER, null),
            whatsappNumber = prefs.getString(KEY_WHATSAPP_NUMBER, null),
            activationTimestamp = prefs.getLong(KEY_ACTIVATION_TIME, 0L).takeIf { it > 0 },
            expirationTimestamp = expirationTime.takeIf { it > 0 },
            lastSeenTimestamp = lastVerified.takeIf { it > 0 },
            rejectionReason = prefs.getString(KEY_REJECTION_REASON, null),
            daysRemaining = daysRemaining,
            durationSeconds = prefs.getLong("key_duration_seconds", 0L).takeIf { it > 0 },
            serverTime = trustedNowMillis(),
            isLifetime = expirationTime == 0L && status == "APPROVED"
        )
    }

    fun clearCachedLicense() {
        prefs.edit()
            .remove(KEY_STATUS)
            .remove(KEY_LICENSE_ID)
            .remove(KEY_USER_NAME)
            .remove(KEY_CONTACT_NUMBER)
            .remove(KEY_TELEGRAM_USER)
            .remove(KEY_WHATSAPP_NUMBER)
            .remove(KEY_ACTIVATION_TIME)
            .remove(KEY_EXPIRATION_TIME)
            .remove("key_duration_seconds")
            .remove(KEY_LAST_VERIFIED_TIME)
            .remove(KEY_REJECTION_REASON)
            .remove(KEY_CHECKSUM)
            .remove(KEY_SERVER_ANCHOR_TIME)
            .remove(KEY_SERVER_ANCHOR_ELAPSED)
            .apply()
    }

    fun isOfflineGraceValid(expirationTime: Long): Boolean {
        val lastVerified = prefs.getLong(KEY_LAST_VERIFIED_TIME, 0L)
        val now = trustedNowMillis()
        val gracePeriodMs = 24 * 60 * 60 * 1000L // 24 hours offline grace

        // Must have been verified within the last 24 hours and not expired
        return (now - lastVerified < gracePeriodMs) && (expirationTime == 0L || now < expirationTime)
    }


    fun trustedNowMillis(): Long {
        val anchorTime = prefs.getLong(KEY_SERVER_ANCHOR_TIME, 0L)
        val anchorElapsed = prefs.getLong(KEY_SERVER_ANCHOR_ELAPSED, 0L)
        if (anchorTime > 0L && anchorElapsed > 0L) {
            val elapsedDelta = SystemClock.elapsedRealtime() - anchorElapsed
            if (elapsedDelta >= 0L && elapsedDelta <= 7L * 24L * 60L * 60L * 1000L) {
                return anchorTime + elapsedDelta
            }
        }
        return System.currentTimeMillis() + prefs.getLong(KEY_SERVER_OFFSET, 0L)
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    private fun calculateChecksum(deviceId: String, status: String, expiration: Long): String {
        val raw = "SECURE_MI_UNLOCK_${deviceId}_${status}_$expiration"
        val md = MessageDigest.getInstance("SHA-256")
        val bytes = md.digest(raw.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }
}
