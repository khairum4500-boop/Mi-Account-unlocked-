package com.example.ui.viewmodel

import android.app.Application
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.local.LicensePreferences
import com.example.data.model.AppConfigResponse
import com.example.data.model.DeviceRegistrationRequest
import com.example.data.model.LicenseStatusResponse
import com.example.data.repository.LicenseRepository
import com.example.util.DeviceIdProvider
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class MainUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val deviceId: String = "",
    val license: LicenseStatusResponse? = null,
    val appConfig: AppConfigResponse = AppConfigResponse(),
    val isMaintenance: Boolean = false,
    val isUpdateRequired: Boolean = false,
    val activeAnnouncement: String? = null,
    val errorMessage: String? = null,
    val successMessage: String? = null,
    val isSubmittingApproval: Boolean = false,
    val serverBaseUrl: String = "",
    val cooldownSeconds: Int = 0
)

class MainViewModel(application: Application) : AndroidViewModel(application) {

    private val preferences = LicensePreferences(application)
    private val repository = LicenseRepository(preferences)

    private val _uiState = MutableStateFlow(MainUiState())
    val uiState: StateFlow<MainUiState> = _uiState.asStateFlow()

    private val appVersionCode = 1
    private var submitCooldownJob: Job? = null
    private var lastSubmitTime = 0L
    private var lastRefreshTime = 0L

    init {
        val deviceId = DeviceIdProvider.getDeviceId(application)
        val cachedLicense = repository.getCachedLicense(deviceId)

        _uiState.update {
            it.copy(
                deviceId = deviceId,
                license = cachedLicense,
                serverBaseUrl = repository.getBaseUrl()
            )
        }

        refreshAll()
    }

    fun refreshAll() {
        val now = System.currentTimeMillis()
        if (now - lastRefreshTime < 2000L && _uiState.value.isRefreshing) {
            return // Debounce refresh requests
        }
        lastRefreshTime = now

        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, errorMessage = null) }
            val deviceId = _uiState.value.deviceId

            // 1. Fetch remote App Config
            val configResult = repository.getAppConfig()
            if (configResult.isSuccess) {
                val config = configResult.getOrNull() ?: AppConfigResponse()
                val isMaintenance = config.maintenanceMode
                val isUpdateRequired = appVersionCode < config.minVersion
                _uiState.update {
                    it.copy(
                        appConfig = config,
                        isMaintenance = isMaintenance,
                        isUpdateRequired = isUpdateRequired,
                        activeAnnouncement = config.announcement
                    )
                }
            }

            // 2. Fetch server-authoritative License Status
            val licenseResult = repository.getLicenseStatus(deviceId)
            if (licenseResult.isSuccess) {
                val licenseData = licenseResult.getOrNull()
                _uiState.update {
                    it.copy(
                        license = licenseData,
                        isLoading = false,
                        isRefreshing = false
                    )
                }

                // If approved, trigger periodic heartbeat
                if (licenseData?.status == "APPROVED") {
                    repository.sendHeartbeat(deviceId, appVersionCode)
                }
            } else {
                val cached = repository.getCachedLicense(deviceId)
                _uiState.update {
                    it.copy(
                        license = cached,
                        isLoading = false,
                        isRefreshing = false,
                        errorMessage = licenseResult.exceptionOrNull()?.localizedMessage
                    )
                }
            }
        }
    }

    fun submitApprovalRequest(
        name: String,
        contact: String,
        telegram: String,
        whatsapp: String
    ) {
        val now = System.currentTimeMillis()
        if (now - lastSubmitTime < 3000L || _uiState.value.isSubmittingApproval || _uiState.value.cooldownSeconds > 0) {
            return // Enforce 3-second cooldown to protect server and prevent duplicate requests
        }
        lastSubmitTime = now

        val deviceId = _uiState.value.deviceId

        if (name.isBlank() || contact.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Name and Contact Number are required.") }
            return
        }

        // Start 3-second countdown timer for UI feedback and anti-spam protection
        submitCooldownJob?.cancel()
        submitCooldownJob = viewModelScope.launch {
            for (sec in 3 downTo 1) {
                _uiState.update { it.copy(cooldownSeconds = sec) }
                delay(1000L)
            }
            _uiState.update { it.copy(cooldownSeconds = 0) }
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSubmittingApproval = true, errorMessage = null) }

            val req = DeviceRegistrationRequest(
                deviceId = deviceId,
                name = name.trim(),
                contactNumber = contact.trim(),
                telegramUsername = telegram.trim(),
                whatsappNumber = whatsapp.trim(),
                appVersion = appVersionCode,
                deviceModel = Build.MODEL,
                deviceBrand = Build.BRAND
            )

            val result = repository.submitApproval(req)
            if (result.isSuccess) {
                _uiState.update {
                    it.copy(
                        isSubmittingApproval = false,
                        license = result.getOrNull(),
                        successMessage = "Your approval request has been submitted. Please contact the administrator and wait for approval."
                    )
                }
            } else {
                _uiState.update {
                    it.copy(
                        isSubmittingApproval = false,
                        errorMessage = result.exceptionOrNull()?.localizedMessage ?: "Failed to submit request"
                    )
                }
            }
        }
    }

    fun updateServerUrl(url: String) {
        repository.updateBaseUrl(url)
        _uiState.update { it.copy(serverBaseUrl = repository.getBaseUrl()) }
        refreshAll()
    }

    fun dismissAnnouncement() {
        _uiState.update { it.copy(activeAnnouncement = null) }
    }

    fun clearMessage() {
        _uiState.update { it.copy(errorMessage = null, successMessage = null) }
    }
}
