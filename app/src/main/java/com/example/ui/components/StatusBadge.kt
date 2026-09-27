package com.example.ui.components

import com.example.ui.localization.tr

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ui.theme.StatusApproved
import com.example.ui.theme.StatusBlocked
import com.example.ui.theme.StatusExpiring
import com.example.ui.theme.StatusPending
import com.example.ui.theme.StatusRejected

@Composable
fun StatusBadge(
    status: String,
    modifier: Modifier = Modifier,
    daysRemaining: Long? = null
) {
    val (bgColor, dotColor, label) = when (status.uppercase()) {
        "APPROVED" -> {
            if (daysRemaining != null && daysRemaining <= 3 && daysRemaining > 0) {
                Triple(StatusExpiring.copy(alpha = 0.18f), StatusExpiring, tr("Expiring Soon (%sd)").format(daysRemaining))
            } else {
                Triple(StatusApproved.copy(alpha = 0.18f), StatusApproved, tr("Active / Approved"))
            }
        }
        "PENDING" -> Triple(StatusPending.copy(alpha = 0.18f), StatusPending, tr("Waiting Approval"))
        "EXPIRED" -> Triple(StatusRejected.copy(alpha = 0.18f), StatusRejected, tr("License Expired"))
        "BLOCKED" -> Triple(StatusBlocked.copy(alpha = 0.18f), StatusBlocked, tr("Device Blocked"))
        "REJECTED" -> Triple(StatusRejected.copy(alpha = 0.18f), StatusRejected, tr("Request Rejected"))
        else -> Triple(Color(0xFF6B7280).copy(alpha = 0.18f), Color(0xFF9CA3AF), tr("Not Registered"))
    }

    Box(
        modifier = modifier
            .background(bgColor, RoundedCornerShape(12.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .background(dotColor, CircleShape)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = label,
                color = dotColor,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold
            )
        }
    }
}
