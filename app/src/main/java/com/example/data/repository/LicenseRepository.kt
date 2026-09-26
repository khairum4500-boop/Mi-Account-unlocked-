package com.example.data.repository

import com.example.data.api.MiUnlockApiService
import com.example.data.local.LicensePreferences
import com.example.data.model.AppConfigResponse
import com.example.data.model.DeviceRegistrationRequest
import com.example.data.model.HeartbeatRequest
import com.example.data.model.LicenseStatusResponse
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit

class LicenseRepository(private val preferences: LicensePreferences) {

    private var currentBaseUrl: String = ""
    private var apiService: MiUnlockApiService? = null

    private fun getApiService(): MiUnlockApiService {
        val baseUrl = preferences.baseUrl
        if (apiService == null || currentBaseUrl != baseUrl) {
            currentBaseUrl = baseUrl
            val logging = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            }
            val okHttpClient = OkHttpClient.Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(15, TimeUnit.SECONDS)
                .writeTimeout(15, TimeUnit.SECONDS)
                .addInterceptor(logging)
                .build()

            val moshi = Moshi.Builder()
                .add(KotlinJsonAdapterFactory())
                .build()

            val retrofit = Retrofit.Builder()
                .baseUrl(baseUrl)
                .client(okHttpClient)
                .addConverterFactory(MoshiConverterFactory.create(moshi))
                .build()

            apiService = retrofit.create(MiUnlockApiService::class.java)
        }
        return apiService!!
    }

    suspend fun getLicenseStatus(deviceId: String): Result<LicenseStatusResponse> {
        return try {
            val response = getApiService().getLicenseStatus(deviceId)
            if (response.isSuccessful && response.body() != null) {
                val data = response.body()!!
                preferences.saveLicense(data)
                Result.success(data)
            } else {
                // If 404 or specific code, fallback to cache
                fallbackOrError(deviceId, "Server returned ${response.code()}: ${response.message()}")
            }
        } catch (e: Exception) {
            fallbackOrError(deviceId, e.localizedMessage ?: "Network connection failed")
        }
    }

    private fun fallbackOrError(deviceId: String, fallbackReason: String): Result<LicenseStatusResponse> {
        val cached = preferences.getCachedLicense(deviceId)
        return if (cached != null) {
            if (cached.status == "APPROVED") {
                val exp = cached.expirationTimestamp ?: 0L
                if (preferences.isOfflineGraceValid(exp)) {
                    Result.success(cached.copy(notes = "Offline Grace Active. $fallbackReason"))
                } else {
                    Result.success(cached.copy(status = "EXPIRED", notes = "Offline grace period expired. Reconnect to internet."))
                }
            } else {
                Result.success(cached)
            }
        } else {
            Result.failure(Exception(fallbackReason))
        }
    }

    suspend fun submitApproval(request: DeviceRegistrationRequest): Result<LicenseStatusResponse> {
        return try {
            val response = getApiService().submitApprovalRequest(request)
            if (response.isSuccessful && response.body() != null) {
                val data = response.body()!!
                preferences.hasSubmittedRequest = true
                preferences.saveLicense(data)
                Result.success(data)
            } else {
                val errorMsg = response.errorBody()?.string() ?: "Failed to submit request (${response.code()})"
                Result.failure(Exception(errorMsg))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun sendHeartbeat(deviceId: String, appVersion: Int): Result<Boolean> {
        return try {
            val response = getApiService().sendHeartbeat(
                HeartbeatRequest(
                    deviceId = deviceId,
                    appVersion = appVersion,
                    timestamp = System.currentTimeMillis()
                )
            )
            Result.success(response.isSuccessful)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getAppConfig(): Result<AppConfigResponse> {
        return try {
            val response = getApiService().getAppConfig()
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.success(AppConfigResponse())
            }
        } catch (e: Exception) {
            // Safe fallback to default configuration
            Result.success(AppConfigResponse())
        }
    }

    fun getCachedLicense(deviceId: String): LicenseStatusResponse? {
        return preferences.getCachedLicense(deviceId)
    }

    fun getBaseUrl(): String = preferences.baseUrl

    fun updateBaseUrl(url: String) {
        preferences.baseUrl = url
        apiService = null // Force client rebuild
    }
}
