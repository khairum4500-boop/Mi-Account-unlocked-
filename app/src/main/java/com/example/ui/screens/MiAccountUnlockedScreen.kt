package com.example.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Login
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Terminal
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.LocalTextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ui.theme.MiOrange
import com.example.ui.theme.StatusApproved
import com.example.ui.theme.TechCyan
import com.example.ui.theme.TechDarkSurface
import com.example.ui.theme.TechDarkSurfaceVariant
import com.example.ui.viewmodel.MainUiState
import com.example.ui.localization.tr
import dev.rohitverma882.miunlock_account_v2.LoginData
import dev.rohitverma882.miunlock_account_v2.LoginActivity
import com.example.util.CanonicalPayload

@Composable
fun MiAccountUnlockedScreen(
    state: MainUiState,
    loginData: LoginData?,
    onOpenLogin: () -> Unit,
    onLogout: () -> Unit
) {
    val context = LocalContext.current
    val scrollState = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // License status badge banner
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = TechDarkSurfaceVariant),
            shape = RoundedCornerShape(16.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, StatusApproved.copy(alpha = 0.5f))
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .background(StatusApproved.copy(alpha = 0.15f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.VerifiedUser,
                        contentDescription = tr("Active License"),
                        tint = StatusApproved,
                        modifier = Modifier.size(24.dp)
                    )
                }

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = tr("Device Authorized & Active"),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Text(
                        text = if (state.license?.isLifetime == true) {
                            tr("Lifetime Access Granted")
                        } else {
                            tr("Remaining: %s").format(formatRemaining(state.remainingMillis))
                        },
                        fontSize = 13.sp,
                        color = StatusApproved
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        if (loginData == null) {
            // Need to Log in to Xiaomi Account
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = TechDarkSurface),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        modifier = Modifier
                            .size(72.dp)
                            .background(MiOrange.copy(alpha = 0.15f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Login,
                            contentDescription = tr("Login"),
                            tint = MiOrange,
                            modifier = Modifier.size(36.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = tr("Sign In with Xiaomi Account"),
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = tr("Log into your Xiaomi / Mi Account to capture the Unlock Token (passToken, userId, deviceId) required for bootloader unlocking."),
                        fontSize = 13.sp,
                        color = Color(0xFF9CA3AF),
                        lineHeight = 18.sp,
                        modifier = Modifier.padding(horizontal = 8.dp)
                    )

                    Spacer(modifier = Modifier.height(24.dp))

                    Button(
                        onClick = onOpenLogin,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = MiOrange)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Login,
                            contentDescription = null,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = tr("OPEN MI ACCOUNT LOGIN"),
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                            color = Color.White
                        )
                    }
                }
            }
        } else {
            // Xiaomi Account details are captured!
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = TechDarkSurface),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(20.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .background(MiOrange.copy(alpha = 0.2f), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.AccountCircle,
                                contentDescription = null,
                                tint = MiOrange,
                                modifier = Modifier.size(22.dp)
                            )
                        }

                        Spacer(modifier = Modifier.width(12.dp))

                        Column {
                            Text(
                                text = tr("Mi Account Details"),
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                            Text(
                                text = tr("Token captured successfully"),
                                fontSize = 12.sp,
                                color = StatusApproved
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(18.dp))

                    // Token items
                    TokenItemCard(
                        title = tr("User ID"),
                        value = loginData.userId,
                        icon = Icons.Default.AccountCircle,
                        onCopy = { copyToClipboard(context, tr("User ID"), loginData.userId, tr("Copied")) }
                    )

                    Spacer(modifier = Modifier.height(10.dp))

                    TokenItemCard(
                        title = tr("Device ID"),
                        value = loginData.deviceId,
                        icon = Icons.Default.PhoneAndroid,
                        onCopy = { copyToClipboard(context, tr("Device ID"), loginData.deviceId, tr("Copied")) }
                    )

                    Spacer(modifier = Modifier.height(10.dp))

                    TokenItemCard(
                        title = tr("Pass Token"),
                        value = loginData.passToken,
                        icon = Icons.Default.Key,
                        onCopy = { copyToClipboard(context, tr("Pass Token"), loginData.passToken, tr("Copied")) }
                    )

                    Spacer(modifier = Modifier.height(20.dp))

                    // Copy All for Termux
                    Button(
                        onClick = {
                            val termuxPayload = "USER_ID=\"${loginData.userId}\"\nDEVICE_ID=\"${loginData.deviceId}\"\nPASS_TOKEN=\"${loginData.passToken}\""
                            copyToClipboard(context, "Termux MiUnlock Payload", termuxPayload, tr("Copied"))
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = TechCyan)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Terminal,
                            contentDescription = null,
                            tint = Color.Black,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = tr("COPY ALL FOR TERMUX"),
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp,
                            color = Color.Black
                        )
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Spacer(modifier = Modifier.height(14.dp))
                    CanonicalOutputCard(loginData)

                    // Logout / Switch Account
                    OutlinedButton(
                        onClick = onLogout,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(46.dp),
                        shape = RoundedCornerShape(12.dp),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFEF4444).copy(alpha = 0.7f))
                    ) {
                        Icon(
                            imageVector = Icons.Default.ExitToApp,
                            contentDescription = null,
                            tint = Color(0xFFEF4444),
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = tr("LOGOUT & SWITCH ACCOUNT"),
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 13.sp,
                            color = Color(0xFFEF4444)
                        )
                    }
                }
            }
        }
    }
}


@Composable
private fun formatRemaining(milliseconds: Long): String {
    var seconds = (milliseconds.coerceAtLeast(0L) / 1000L)
    val days = seconds / 86400; seconds %= 86400
    val hours = seconds / 3600; seconds %= 3600
    val minutes = seconds / 60; seconds %= 60
    return "%02d %s : %02d %s : %02d %s : %02d %s".format(days, tr("Days"), hours, tr("Hours"), minutes, tr("Minutes"), seconds, tr("Seconds"))
}

@Composable
private fun CanonicalOutputCard(loginData: LoginData) {
    val context = LocalContext.current
    val payload = remember(loginData.passToken, loginData.userId, loginData.deviceId) { CanonicalPayload.build(loginData) }
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = TechDarkSurface),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            if (payload.errorKey != null) {
                Text(tr(payload.errorKey!!), color = Color.Red, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                Spacer(modifier = Modifier.height(8.dp))
            }
            Text(tr("Original Output (HEX)"), fontWeight = FontWeight.Bold, color = Color.White)
            Text(payload.hex, fontFamily = FontFamily.Monospace, fontSize = 10.sp, color = TechCyan, modifier = Modifier.padding(top = 8.dp), style = TextStyle(textDirection = TextDirection.Ltr))
            OutlinedButton(enabled = payload.isValid, onClick = { copyToClipboard(context, tr("Original Output"), payload.hex, tr("Copied")) }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp)); Text(tr("COPY ORIGINAL OUTPUT"))
            }
            Spacer(modifier = Modifier.height(14.dp))
            Text(tr("Decoded Output (JSON)"), fontWeight = FontWeight.Bold, color = Color.White)
            Text(payload.decodedJson ?: payload.json, fontFamily = FontFamily.Monospace, fontSize = 11.sp, color = Color.White, modifier = Modifier.padding(top = 8.dp), style = TextStyle(textDirection = TextDirection.Ltr))
            OutlinedButton(enabled = payload.isValid, onClick = { copyToClipboard(context, tr("Decoded Output"), payload.json, tr("Copied")) }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp)); Text(tr("COPY DECODED OUTPUT"))
            }
            Spacer(modifier = Modifier.height(10.dp))
            Text(if (payload.isValid) tr("✓ HEX VALID • ✓ DECODE SUCCESSFUL • ✓ JSON MATCH") else tr("✗ OUTPUT VALIDATION FAILED"), color = if (payload.isValid) StatusApproved else Color.Red, fontWeight = FontWeight.Bold, fontSize = 12.sp)
        }
    }
}

private fun copyToClipboard(context: Context, label: String, value: String, confirmation: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText(label, value))
    Toast.makeText(context, confirmation, Toast.LENGTH_SHORT).show()
}

@Composable
private fun TokenItemCard(
    title: String,
    value: String,
    icon: ImageVector,
    onCopy: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = TechDarkSurfaceVariant),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = TechCyan,
                modifier = Modifier.size(20.dp)
            )

            Spacer(modifier = Modifier.width(10.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    fontSize = 11.sp,
                    color = Color(0xFF9CA3AF)
                )
                Text(
                    text = value,
                    fontSize = 13.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White,
                    maxLines = 2
                )
            }

            IconButton(
                onClick = onCopy,
                modifier = Modifier.size(36.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.ContentCopy,
                    contentDescription = "${tr("Copy")} $title",
                    tint = TechCyan,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}

