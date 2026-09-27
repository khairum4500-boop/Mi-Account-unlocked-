package com.example.data.model

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

enum class LicenseStatus {
    @Json(name = "UNREGISTERED") UNREGISTERED,
    @Json(name = "PENDING") PENDING,
    @Json(name = "APPROVED") APPROVED,
    @Json(name = "REJECTED") REJECTED,
    @Json(name = "EXPIRED") EXPIRED,
    @Json(name = "BLOCKED") BLOCKED,
    @Json(name = "REVOKED") REVOKED
}

@JsonClass(generateAdapter = true)
data class DeviceRegistrationRequest(
    @Json(name = "deviceId") val deviceId: String,
    @Json(name = "name") val name: String,
    @Json(name = "contactNumber") val contactNumber: String,
    @Json(name = "telegramUsername") val telegramUsername: String,
    @Json(name = "whatsappNumber") val whatsappNumber: String,
    @Json(name = "appVersion") val appVersion: Int = 1,
    @Json(name = "deviceModel") val deviceModel: String = "",
    @Json(name = "deviceBrand") val deviceBrand: String = ""
)

@JsonClass(generateAdapter = true)
data class LicenseStatusResponse(
    @Json(name = "status") val status: String,
    @Json(name = "deviceId") val deviceId: String,
    @Json(name = "licenseId") val licenseId: String? = null,
    @Json(name = "userName") val userName: String? = null,
    @Json(name = "contactNumber") val contactNumber: String? = null,
    @Json(name = "telegramUsername") val telegramUsername: String? = null,
    @Json(name = "whatsappNumber") val whatsappNumber: String? = null,
    @Json(name = "createdTimestamp") val createdTimestamp: Long? = null,
    @Json(name = "approvedTimestamp") val approvedTimestamp: Long? = null,
    @Json(name = "activationTimestamp") val activationTimestamp: Long? = null,
    @Json(name = "expirationTimestamp") val expirationTimestamp: Long? = null,
    @Json(name = "lastSeenTimestamp") val lastSeenTimestamp: Long? = null,
    @Json(name = "serverTime") val serverTime: Long? = null,
    @Json(name = "notes") val notes: String? = null,
    @Json(name = "rejectionReason") val rejectionReason: String? = null,
    @Json(name = "daysRemaining") val daysRemaining: Long? = null,
    @Json(name = "durationSeconds") val durationSeconds: Long? = null,
    @Json(name = "isLifetime") val isLifetime: Boolean? = false
)

@JsonClass(generateAdapter = true)
data class AppConfigResponse(
    @Json(name = "appName") val appName: String = "MI Unlock",
    @Json(name = "minVersion") val minVersion: Int = 1,
    @Json(name = "latestVersion") val latestVersion: Int = 1,
    @Json(name = "updateUrl") val updateUrl: String = "",
    @Json(name = "maintenanceMode") val maintenanceMode: Boolean = false,
    @Json(name = "announcement") val announcement: String? = null,
    @Json(name = "adminTelegram") val adminTelegram: String = "@itz_khairum",
    @Json(name = "adminContact") val adminContact: String = "01577430152",
    @Json(name = "adminWhatsapp") val adminWhatsapp: String = "01735047020",
    @Json(name = "adminEmail") val adminEmail: String = "siam162536@gmail.com"
)

@JsonClass(generateAdapter = true)
data class HeartbeatRequest(
    @Json(name = "deviceId") val deviceId: String,
    @Json(name = "appVersion") val appVersion: Int,
    @Json(name = "timestamp") val timestamp: Long
)

@JsonClass(generateAdapter = true)
data class GenericApiResponse(
    @Json(name = "success") val success: Boolean,
    @Json(name = "message") val message: String? = null
)
