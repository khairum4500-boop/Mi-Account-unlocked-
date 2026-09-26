package com.example.util

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast

object AdminContactHelper {

    const val DEFAULT_TELEGRAM = "@itz_khairum"
    const val DEFAULT_CONTACT = "01577430152"
    const val DEFAULT_WHATSAPP = "01735047020"
    const val DEFAULT_EMAIL = "siam162536@gmail.com"

    fun openTelegram(context: Context, username: String = DEFAULT_TELEGRAM) {
        val cleanUser = username.removePrefix("@")
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("tg://resolve?domain=$cleanUser"))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (e: Exception) {
            val webIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://t.me/$cleanUser"))
            webIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(webIntent)
        }
    }

    fun openWhatsApp(context: Context, number: String = DEFAULT_WHATSAPP, message: String = "Hello Admin, I am contacting you regarding MI Unlock license.") {
        try {
            var formatted = number.trim().replace(" ", "").replace("-", "")
            if (formatted.startsWith("0")) {
                formatted = "88$formatted" // Bangladesh standard prefix
            } else if (!formatted.startsWith("+") && !formatted.startsWith("88")) {
                formatted = "880$formatted"
            }
            formatted = formatted.removePrefix("+")

            val uri = Uri.parse("https://api.whatsapp.com/send?phone=$formatted&text=${Uri.encode(message)}")
            val intent = Intent(Intent.ACTION_VIEW, uri)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Cannot open WhatsApp: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
        }
    }

    fun callAdmin(context: Context, number: String = DEFAULT_CONTACT) {
        try {
            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$number"))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Cannot launch dialer: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
        }
    }

    fun sendEmail(context: Context, email: String = DEFAULT_EMAIL, subject: String = "MI Unlock License Request", deviceId: String = "") {
        try {
            val body = "Hello Admin,\n\nI need assistance with my MI Unlock license.\nDevice ID: $deviceId\n"
            val intent = Intent(Intent.ACTION_SENDTO).apply {
                data = Uri.parse("mailto:")
                putExtra(Intent.EXTRA_EMAIL, arrayOf(email))
                putExtra(Intent.EXTRA_SUBJECT, subject)
                putExtra(Intent.EXTRA_TEXT, body)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Cannot open email client: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
        }
    }

    fun copyToClipboard(context: Context, text: String, label: String = "Copied") {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText(label, text)
        clipboard.setPrimaryClip(clip)
        Toast.makeText(context, "$label copied to clipboard", Toast.LENGTH_SHORT).show()
    }
}
