package com.example.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ui.components.AdminContactCard
import com.example.ui.components.StatusBadge
import com.example.ui.theme.MiOrange
import com.example.ui.theme.StatusApproved
import com.example.ui.theme.TechCyan
import com.example.ui.theme.TechDarkBg
import com.example.ui.theme.TechDarkBorder
import com.example.ui.theme.TechDarkSurface
import com.example.ui.theme.TechDarkSurfaceVariant
import com.example.ui.viewmodel.MainUiState
import com.example.ui.localization.tr
import com.example.util.AdminContactHelper
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun LicenseAdminScreen(
    state: MainUiState,
    onRefresh: () -> Unit,
    onUpdateServerUrl: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val copiedText = tr("Copied")
    val deviceIdLabel = tr("Device ID")
    val scrollState = rememberScrollState()

    var serverUrlInput by remember(state.serverBaseUrl) { mutableStateOf(state.serverBaseUrl) }
    var isEditingServerUrl by remember { mutableStateOf(false) }

    val dateFormat = SimpleDateFormat("dd MMMM yyyy HH:mm", Locale.getDefault())

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(TechDarkBg)
            .verticalScroll(scrollState)
            .padding(16.dp)
    ) {
        // License Details Card
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .testTag("license_details_card"),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = TechDarkSurface),
            border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(TechDarkBorder))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .background(StatusApproved.copy(alpha = 0.15f), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Security,
                                contentDescription = tr("License"),
                                tint = StatusApproved,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = tr("License Details"),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                            Text(
                                text = tr("Authorized by Telegram Administrator"),
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(0xFF9CA3AF)
                            )
                        }
                    }

                    StatusBadge(
                        status = state.license?.status ?: "APPROVED",
                        daysRemaining = state.license?.daysRemaining
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                LicenseItem(tr("License ID"), state.license?.licenseId ?: "LIC-GEN-${state.deviceId.takeLast(6)}")
                LicenseItem(tr("Device ID"), state.deviceId, isCopyable = true) {
                    AdminContactHelper.copyToClipboard(context, state.deviceId, deviceIdLabel, copiedText)
                }
                LicenseItem(tr("Licensee Name"), state.license?.userName ?: tr("Authorized User"))
                LicenseItem(tr("Contact Phone"), state.license?.contactNumber ?: tr("N/A"))
                LicenseItem(
                    tr("Activated On"),
                    state.license?.activationTimestamp?.let { dateFormat.format(Date(it)) } ?: tr("Active")
                )
                LicenseItem(
                    tr("Expiration Date"),
                    if (state.license?.isLifetime == true) tr("Lifetime Access")
                    else state.license?.expirationTimestamp?.let { dateFormat.format(Date(it)) } ?: "Lifetime"
                )

                if (state.license?.notes != null) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = tr("Notes: %s").format(state.license.notes),
                        fontSize = 11.sp,
                        color = TechCyan
                    )
                }

                Spacer(modifier = Modifier.height(14.dp))

                Button(
                    onClick = onRefresh,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(44.dp)
                        .testTag("btn_refresh_license"),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MiOrange)
                ) {
                    Icon(imageVector = Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(tr("Sync & Verify License"))
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Administrator Contacts
        AdminContactCard(
            telegram = state.appConfig.adminTelegram,
            contactNumber = state.appConfig.adminContact,
            whatsapp = state.appConfig.adminWhatsapp,
            email = state.appConfig.adminEmail,
            deviceId = state.deviceId
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Server API Configuration
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = TechDarkSurface),
            border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(TechDarkBorder))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Dns,
                        contentDescription = tr("Server"),
                        tint = TechCyan,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = tr("License Server Configuration"),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = tr("Configured Server URL for license authorization & Telegram bot webhook:"),
                    fontSize = 12.sp,
                    color = Color(0xFF9CA3AF)
                )

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = serverUrlInput,
                    onValueChange = {
                        serverUrlInput = it
                        isEditingServerUrl = true
                    },
                    label = { Text(tr("License Server Base URL")) },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("input_server_url"),
                    shape = RoundedCornerShape(10.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = TechCyan,
                        unfocusedBorderColor = TechDarkBorder
                    )
                )

                if (isEditingServerUrl) {
                    Spacer(modifier = Modifier.height(10.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = {
                                onUpdateServerUrl(serverUrlInput.trim())
                                isEditingServerUrl = false
                            },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = TechCyan)
                        ) {
                            Text(tr("Save & Connect"), color = Color.Black, fontWeight = FontWeight.Bold)
                        }

                        OutlinedButton(
                            onClick = {
                                serverUrlInput = "http://10.0.2.2:3000/"
                                onUpdateServerUrl("http://10.0.2.2:3000/")
                                isEditingServerUrl = false
                            },
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text(tr("Reset"))
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Security & Disclaimer Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = TechDarkSurfaceVariant.copy(alpha = 0.5f))
        ) {
            Row(modifier = Modifier.padding(14.dp)) {
                Icon(
                    imageVector = Icons.Default.Info,
                    contentDescription = null,
                    tint = Color(0xFF9CA3AF),
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = tr("Security notice: MI Unlock uses server-authoritative license verification. Private bot tokens and credentials are never stored in this APK. Tampering with device clocks or local preferences is strictly detected."),
                    fontSize = 11.sp,
                    color = Color(0xFF9CA3AF),
                    lineHeight = 16.sp
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))
    }
}

@Composable
private fun LicenseItem(
    label: String,
    value: String,
    isCopyable: Boolean = false,
    onCopy: () -> Unit = {}
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(text = label, fontSize = 12.sp, color = Color(0xFF9CA3AF))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = value,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color.White
            )
            if (isCopyable) {
                IconButton(onClick = onCopy, modifier = Modifier.size(24.dp)) {
                    Icon(
                        imageVector = Icons.Default.ContentCopy,
                        contentDescription = tr("Copy"),
                        tint = TechCyan,
                        modifier = Modifier.size(12.dp)
                    )
                }
            }
        }
    }
}
