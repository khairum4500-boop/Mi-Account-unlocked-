package com.example.data.api

import com.example.data.model.AppConfigResponse
import com.example.data.model.DeviceRegistrationRequest
import com.example.data.model.GenericApiResponse
import com.example.data.model.HeartbeatRequest
import com.example.data.model.LicenseStatusResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

interface MiUnlockApiService {

    @GET("api/license/status")
    suspend fun getLicenseStatus(
        @Query("deviceId") deviceId: String
    ): Response<LicenseStatusResponse>

    @POST("api/approval/request")
    suspend fun submitApprovalRequest(
        @Body request: DeviceRegistrationRequest
    ): Response<LicenseStatusResponse>

    @POST("api/heartbeat")
    suspend fun sendHeartbeat(
        @Body request: HeartbeatRequest
    ): Response<GenericApiResponse>

    @GET("api/app/config")
    suspend fun getAppConfig(): Response<AppConfigResponse>
}
