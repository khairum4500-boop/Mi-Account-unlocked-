package com.example.ui.components

import com.example.ui.localization.tr

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Message
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ui.theme.MiOrange
import com.example.ui.theme.TechCyan
import com.example.ui.theme.TechDarkBorder
import com.example.ui.theme.TechDarkSurface
import com.example.ui.theme.TechDarkSurfaceVariant
import com.example.util.AdminContactHelper

@Composable
fun AdminContactCard(
    modifier: Modifier = Modifier,
    telegram: String = AdminContactHelper.DEFAULT_TELEGRAM,
    contactNumber: String = AdminContactHelper.DEFAULT_CONTACT,
    whatsapp: String = AdminContactHelper.DEFAULT_WHATSAPP,
    email: String = AdminContactHelper.DEFAULT_EMAIL,
    deviceId: String = ""
) {
    val context = LocalContext.current

    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("admin_contact_card"),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = TechDarkSurface
        ),
        border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(TechDarkBorder))
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .background(MiOrange.copy(alpha = 0.15f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Send,
                        contentDescription = tr("Admin Support"),
                        tint = MiOrange,
                        modifier = Modifier.size(18.dp)
                    )
                }
                Spacer(modifier = Modifier.width(10.dp))
                Column {
                    Text(
                        text = tr("Administrator Support"),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Text(
                        text = tr("Contact for license activation, renewal & inquiries"),
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF9CA3AF)
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Contact Items
            ContactRowItem(
                icon = Icons.Default.Send,
                label = tr("Telegram"),
                value = telegram,
                iconColor = TechCyan,
                onCopy = { AdminContactHelper.copyToClipboard(context, telegram, tr("Telegram username"), tr("Copied")) },
                onClick = { AdminContactHelper.openTelegram(context, telegram) }
            )

            ContactRowItem(
                icon = Icons.Default.Message,
                label = tr("WhatsApp"),
                value = whatsapp,
                iconColor = Color(0xFF25D366),
                onCopy = { AdminContactHelper.copyToClipboard(context, whatsapp, tr("WhatsApp number"), tr("Copied")) },
                onClick = { AdminContactHelper.openWhatsApp(context, whatsapp, tr("Hello Admin, inquiry for MI Unlock Device ID: %s").format(deviceId), tr("Cannot open WhatsApp")) }
            )

            ContactRowItem(
                icon = Icons.Default.Call,
                label = tr("Call / Phone"),
                value = contactNumber,
                iconColor = Color(0xFF38BDF8),
                onCopy = { AdminContactHelper.copyToClipboard(context, contactNumber, tr("Contact number"), tr("Copied")) },
                onClick = { AdminContactHelper.callAdmin(context, contactNumber, tr("Cannot launch dialer")) }
            )

            ContactRowItem(
                icon = Icons.Default.Email,
                label = tr("Email"),
                value = email,
                iconColor = Color(0xFFFB923C),
                onCopy = { AdminContactHelper.copyToClipboard(context, email, tr("Admin email"), tr("Copied")) },
                onClick = { AdminContactHelper.sendEmail(context, email, deviceId = deviceId, subject = tr("MI Unlock License Request"), body = tr("Hello Admin,\n\nI need assistance with my MI Unlock license.\nDevice ID: %s\n").format(deviceId), errorPrefix = tr("Cannot open email client")) }
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Quick action buttons grid
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = { AdminContactHelper.openTelegram(context, telegram) },
                    modifier = Modifier
                        .weight(1f)
                        .testTag("action_telegram"),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = TechCyan.copy(alpha = 0.18f), contentColor = TechCyan)
                ) {
                    Text(tr("Telegram"), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }

                Button(
                    onClick = { AdminContactHelper.openWhatsApp(context, whatsapp, tr("Hello Admin, MI Unlock ID: %s").format(deviceId), tr("Cannot open WhatsApp")) },
                    modifier = Modifier
                        .weight(1f)
                        .testTag("action_whatsapp"),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF25D366).copy(alpha = 0.18f), contentColor = Color(0xFF25D366))
                ) {
                    Text(tr("WhatsApp"), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }

                OutlinedButton(
                    onClick = { AdminContactHelper.callAdmin(context, contactNumber, tr("Cannot launch dialer")) },
                    modifier = Modifier
                        .weight(0.9f)
                        .testTag("action_call"),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text(tr("Call"), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun ContactRowItem(
    icon: ImageVector,
    label: String,
    value: String,
    iconColor: Color,
    onCopy: () -> Unit,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .background(TechDarkSurfaceVariant.copy(alpha = 0.6f), RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = iconColor,
            modifier = Modifier.size(18.dp)
        )
        Spacer(modifier = Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = label,
                fontSize = 11.sp,
                color = Color(0xFF9CA3AF)
            )
            Text(
                text = value,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = Color.White
            )
        }
        IconButton(
            onClick = onCopy,
            modifier = Modifier.size(32.dp)
        ) {
            Icon(
                imageVector = Icons.Outlined.ContentCopy,
                contentDescription = "${tr("Copy")} $label",
                tint = Color(0xFF9CA3AF),
                modifier = Modifier.size(16.dp)
            )
        }
    }
}
