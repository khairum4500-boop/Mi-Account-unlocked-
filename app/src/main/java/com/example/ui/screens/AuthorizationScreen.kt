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
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ui.components.AdminContactCard
import com.example.ui.components.StatusBadge
import com.example.ui.theme.MiOrange
import com.example.ui.theme.StatusBlocked
import com.example.ui.theme.StatusPending
import com.example.ui.theme.StatusRejected
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
fun AuthorizationScreen(
    state: MainUiState,
    onSubmitApproval: (name: String, contact: String, telegram: String, whatsapp: String) -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val scrollState = rememberScrollState()

    var nameInput by remember { mutableStateOf(state.license?.userName ?: "") }
    var contactInput by remember { mutableStateOf(state.license?.contactNumber ?: "") }
    var telegramInput by remember { mutableStateOf(state.license?.telegramUsername ?: "") }
    var whatsappInput by remember { mutableStateOf(state.license?.whatsappNumber ?: "") }
    var isEditingForm by remember { mutableStateOf(false) }

    val status = state.license?.status ?: "UNREGISTERED"

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(TechDarkBg)
            .verticalScroll(scrollState)
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(modifier = Modifier.height(20.dp))

        // App Logo & Header
        Box(
            modifier = Modifier
                .size(72.dp)
                .background(MiOrange.copy(alpha = 0.15f), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.Lock,
                contentDescription = tr("MI Unlock Security"),
                tint = MiOrange,
                modifier = Modifier.size(36.dp)
            )
        }

        Spacer(modifier = Modifier.height(14.dp))

        Text(
            text = tr("MI Unlock"),
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White
        )

        Text(
            text = tr("Xiaomi & HyperOS Bootloader Utility"),
            fontSize = 13.sp,
            color = Color(0xFF9CA3AF)
        )

        Spacer(modifier = Modifier.height(20.dp))

        // Device ID Display Box (Always visible and easily copyable)
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .testTag("device_id_card"),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = TechDarkSurface),
            border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(TechDarkBorder))
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = tr("Device ID"),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF9CA3AF)
                    )
                    Text(
                        text = state.deviceId,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = TechCyan,
                        letterSpacing = 1.sp
                    )
                }

                IconButton(
                    onClick = { AdminContactHelper.copyToClipboard(context, state.deviceId, tr("Device ID"), tr("Copied")) },
                    modifier = Modifier.size(36.dp)
                ) {
                    Icon(
                        imageVector = Icons.Outlined.ContentCopy,
                        contentDescription = tr("Copy Device ID"),
                        tint = TechCyan,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // State-Specific Container
        when {
            state.isMaintenance -> {
                MaintenanceCard()
            }
            state.isUpdateRequired -> {
                UpdateRequiredCard(minVersion = state.appConfig.minVersion)
            }
            status == "APPROVED" && state.license?.isLifetime != true && (state.license?.expirationTimestamp == null || state.license.expirationTimestamp <= 0L) -> {
                InvalidLicenseCard(onRefresh = onRefresh)
            }
            status == "PENDING" && !isEditingForm -> {
                PendingStatusCard(
                    state = state,
                    onRefresh = onRefresh,
                    onEdit = { isEditingForm = true }
                )
            }
            status == "REJECTED" && !isEditingForm -> {
                RejectedStatusCard(
                    state = state,
                    onRefresh = onRefresh,
                    onResubmit = { isEditingForm = true }
                )
            }
            status == "EXPIRED" -> {
                ExpiredStatusCard(
                    state = state,
                    onRefresh = onRefresh
                )
            }
            status == "BLOCKED" -> {
                BlockedStatusCard(
                    state = state,
                    onRefresh = onRefresh
                )
            }
            else -> {
                // Registration / Approval Request Form
                ApprovalRequestForm(
                    deviceId = state.deviceId,
                    name = nameInput,
                    contact = contactInput,
                    telegram = telegramInput,
                    whatsapp = whatsappInput,
                    onNameChange = { nameInput = it },
                    onContactChange = { contactInput = it },
                    onTelegramChange = { telegramInput = it },
                    onWhatsappChange = { whatsappInput = it },
                    isSubmitting = state.isSubmittingApproval,
                    cooldownSeconds = state.cooldownSeconds,
                    onSubmit = {
                        onSubmitApproval(nameInput, contactInput, telegramInput, whatsappInput)
                        isEditingForm = false
                    }
                )
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        // Administrator Contact Information
        AdminContactCard(
            telegram = state.appConfig.adminTelegram,
            contactNumber = state.appConfig.adminContact,
            whatsapp = state.appConfig.adminWhatsapp,
            email = state.appConfig.adminEmail,
            deviceId = state.deviceId
        )

        Spacer(modifier = Modifier.height(24.dp))
    }
}

@Composable
private fun ApprovalRequestForm(
    deviceId: String,
    name: String,
    contact: String,
    telegram: String,
    whatsapp: String,
    onNameChange: (String) -> Unit,
    onContactChange: (String) -> Unit,
    onTelegramChange: (String) -> Unit,
    onWhatsappChange: (String) -> Unit,
    isSubmitting: Boolean,
    cooldownSeconds: Int = 0,
    onSubmit: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("approval_form_card"),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = TechDarkSurface),
        border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(TechDarkBorder))
    ) {
        Column(
            modifier = Modifier.padding(18.dp)
        ) {
            Text(
                text = tr("Authorization Required"),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = tr("Admin approval is required before you can use this application. Please submit your details below."),
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFF9CA3AF)
            )

            Spacer(modifier = Modifier.height(16.dp))

            OutlinedTextField(
                value = name,
                onValueChange = onNameChange,
                label = { Text(tr("Full Name *")) },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("input_full_name"),
                shape = RoundedCornerShape(10.dp),
                colors = textFieldDarkColors()
            )

            Spacer(modifier = Modifier.height(10.dp))

            OutlinedTextField(
                value = contact,
                onValueChange = onContactChange,
                label = { Text(tr("Contact Number *")) },
                placeholder = { Text(tr("e.g. 017XXXXXXXX")) },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("input_contact_number"),
                shape = RoundedCornerShape(10.dp),
                colors = textFieldDarkColors()
            )

            Spacer(modifier = Modifier.height(10.dp))

            OutlinedTextField(
                value = telegram,
                onValueChange = onTelegramChange,
                label = { Text(tr("Telegram Username")) },
                placeholder = { Text(tr("e.g. @your_telegram")) },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("input_telegram_user"),
                shape = RoundedCornerShape(10.dp),
                colors = textFieldDarkColors()
            )

            Spacer(modifier = Modifier.height(10.dp))

            OutlinedTextField(
                value = whatsapp,
                onValueChange = onWhatsappChange,
                label = { Text(tr("WhatsApp Number")) },
                placeholder = { Text(tr("e.g. 01XXXXXXXXX")) },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("input_whatsapp_number"),
                shape = RoundedCornerShape(10.dp),
                colors = textFieldDarkColors()
            )

            Spacer(modifier = Modifier.height(10.dp))

            OutlinedTextField(
                value = deviceId,
                onValueChange = {},
                readOnly = true,
                label = { Text(tr("Device ID (read-only)")) },
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("input_device_id_readonly"),
                shape = RoundedCornerShape(10.dp),
                colors = textFieldDarkColors()
            )

            Spacer(modifier = Modifier.height(18.dp))

            Button(
                onClick = onSubmit,
                enabled = !isSubmitting && cooldownSeconds == 0 && name.isNotBlank() && contact.isNotBlank(),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .testTag("btn_request_approval"),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MiOrange,
                    disabledContainerColor = MiOrange.copy(alpha = 0.4f)
                )
            ) {
                if (isSubmitting) {
                    CircularProgressIndicator(
                        color = Color.White,
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(tr("Submitting..."))
                } else if (cooldownSeconds > 0) {
                    Text(
                        text = tr("PLEASE WAIT (%ss)...").format(cooldownSeconds),
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.5.sp
                    )
                } else {
                    Text(
                        text = tr("REQUEST APPROVAL"),
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.5.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun PendingStatusCard(
    state: MainUiState,
    onRefresh: () -> Unit,
    onEdit: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("card_pending_status"),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = TechDarkSurface),
        border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(StatusPending.copy(alpha = 0.5f)))
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .size(54.dp)
                    .background(StatusPending.copy(alpha = 0.15f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.HourglassEmpty,
                    contentDescription = tr("Pending Approval"),
                    tint = StatusPending,
                    modifier = Modifier.size(28.dp)
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            StatusBadge(status = "PENDING")

            Spacer(modifier = Modifier.height(10.dp))

            Text(
                text = tr("Approval Request Submitted"),
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = tr("Your approval request has been submitted.\nPlease contact the administrator and wait for approval."),
                fontSize = 13.sp,
                color = Color(0xFFD1D5DB),
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(14.dp))

            // User Info Summary Box
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(TechDarkSurfaceVariant, RoundedCornerShape(10.dp))
                    .padding(12.dp)
            ) {
                InfoLine(tr("Applicant"), state.license?.userName ?: tr("N/A"))
                InfoLine(tr("Contact"), state.license?.contactNumber ?: tr("N/A"))
                if (!state.license?.telegramUsername.isNullOrBlank()) {
                    InfoLine(tr("Telegram"), state.license?.telegramUsername!!)
                }
                if (!state.license?.whatsappNumber.isNullOrBlank()) {
                    InfoLine(tr("WhatsApp"), state.license?.whatsappNumber!!)
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Button(
                    onClick = onRefresh,
                    modifier = Modifier
                        .weight(1f)
                        .height(44.dp)
                        .testTag("btn_check_approval_status"),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MiOrange)
                ) {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = tr("Refresh"),
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(tr("Check Status"))
                }

                OutlinedButton(
                    onClick = onEdit,
                    modifier = Modifier
                        .weight(0.8f)
                        .height(44.dp)
                        .testTag("btn_edit_request"),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text(tr("Edit Info"))
                }
            }
        }
    }
}

@Composable
private fun RejectedStatusCard(
    state: MainUiState,
    onRefresh: () -> Unit,
    onResubmit: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("card_rejected_status"),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = TechDarkSurface),
        border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(StatusRejected.copy(alpha = 0.5f)))
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .size(54.dp)
                    .background(StatusRejected.copy(alpha = 0.15f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Block,
                    contentDescription = tr("Approval Rejected"),
                    tint = StatusRejected,
                    modifier = Modifier.size(28.dp)
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            StatusBadge(status = "REJECTED")

            Spacer(modifier = Modifier.height(10.dp))

            Text(
                text = tr("Approval Request Rejected"),
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )

            if (!state.license?.rejectionReason.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "${tr("Reason")}: ${state.license?.rejectionReason ?: tr("N/A")}",
                    fontSize = 13.sp,
                    color = StatusRejected,
                    textAlign = TextAlign.Center
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Button(
                    onClick = onResubmit,
                    modifier = Modifier
                        .weight(1f)
                        .height(44.dp),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MiOrange)
                ) {
                    Text(tr("Re-apply"))
                }

                OutlinedButton(
                    onClick = onRefresh,
                    modifier = Modifier
                        .weight(0.9f)
                        .height(44.dp),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text(tr("Check Status"))
                }
            }
        }
    }
}

@Composable
private fun ExpiredStatusCard(
    state: MainUiState,
    onRefresh: () -> Unit
) {
    val expiryFormatted = state.license?.expirationTimestamp?.let {
        SimpleDateFormat("dd MMMM yyyy HH:mm", Locale.getDefault()).format(Date(it))
    } ?: tr("N/A")

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("card_expired_status"),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = TechDarkSurface),
        border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(StatusRejected.copy(alpha = 0.5f)))
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            StatusBadge(status = "EXPIRED")

            Spacer(modifier = Modifier.height(10.dp))

            Text(
                text = tr("License Expired"),
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = "${tr("Expired on")}: $expiryFormatted\n${tr("Please contact the administrator to renew your license.")}",
                fontSize = 13.sp,
                color = Color(0xFFD1D5DB),
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(14.dp))

            Button(
                onClick = onRefresh,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(containerColor = MiOrange)
            ) {
                Text(tr("Refresh License"))
            }
        }
    }
}

@Composable
private fun BlockedStatusCard(
    state: MainUiState,
    onRefresh: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("card_blocked_status"),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = TechDarkSurface),
        border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(StatusBlocked.copy(alpha = 0.5f)))
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            StatusBadge(status = "BLOCKED")

            Spacer(modifier = Modifier.height(10.dp))

            Text(
                text = tr("Device Blocked"),
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = StatusBlocked
            )

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = tr("This device has been blocked by the administrator. Contact support if you believe this is an error."),
                fontSize = 13.sp,
                color = Color(0xFFD1D5DB),
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(14.dp))

            OutlinedButton(
                onClick = onRefresh,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text(tr("Check Status"))
            }
        }
    }
}

@Composable
private fun MaintenanceCard() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = TechDarkSurface),
        border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(TechCyan.copy(alpha = 0.5f)))
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = Icons.Default.Build,
                contentDescription = tr("Maintenance"),
                tint = TechCyan,
                modifier = Modifier.size(36.dp)
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = tr("Maintenance Mode"),
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = tr("MI Unlock is temporarily under maintenance. Please try again later."),
                fontSize = 13.sp,
                color = Color(0xFFD1D5DB),
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun InvalidLicenseCard(onRefresh: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = TechDarkSurface),
        border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(StatusRejected.copy(alpha = 0.5f)))
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(Icons.Default.HourglassEmpty, contentDescription = tr("Invalid expiration timestamp"), tint = StatusRejected, modifier = Modifier.size(36.dp))
            Spacer(modifier = Modifier.height(10.dp))
            Text(tr("Invalid License Data"), fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Spacer(modifier = Modifier.height(6.dp))
            Text(tr("Missing expiration timestamp"), fontSize = 13.sp, color = Color(0xFFD1D5DB), textAlign = TextAlign.Center)
            Spacer(modifier = Modifier.height(14.dp))
            OutlinedButton(onClick = onRefresh) {
                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(tr("Refresh"))
            }
        }
    }
}

@Composable
private fun UpdateRequiredCard(minVersion: Int) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = TechDarkSurface),
        border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(MiOrange.copy(alpha = 0.5f)))
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = Icons.Default.SystemUpdate,
                contentDescription = tr("Update Required"),
                tint = MiOrange,
                modifier = Modifier.size(36.dp)
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = tr("Update Required"),
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = tr("A newer version of MI Unlock is required (v%s+). Please contact the administrator or download the latest update.").format(minVersion),
                fontSize = 13.sp,
                color = Color(0xFFD1D5DB),
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun InfoLine(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = label, fontSize = 12.sp, color = Color(0xFF9CA3AF))
        Text(text = value, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Color.White)
    }
}

@Composable
private fun textFieldDarkColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = Color.White,
    unfocusedTextColor = Color.White,
    focusedBorderColor = MiOrange,
    unfocusedBorderColor = TechDarkBorder,
    focusedLabelColor = MiOrange,
    unfocusedLabelColor = Color(0xFF9CA3AF),
    cursorColor = MiOrange
)
