package com.example.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Language
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.DropdownMenu
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import com.example.ui.localization.AppLanguage
import com.example.ui.localization.AppLocalization
import com.example.ui.localization.tr

@Composable
fun LanguageSelector(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var expanded by remember { mutableStateOf(false) }
    val current by AppLocalization.language.collectAsState()
    Box(modifier = modifier) {
        IconButton(onClick = { expanded = true }, modifier = Modifier.testTag("language_selector")) {
            Icon(Icons.Default.Language, contentDescription = tr("Language"))
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            AppLanguage.entries.forEach { lang ->
                DropdownMenuItem(
                    text = { Text(lang.nativeName) },
                    onClick = { AppLocalization.setLanguage(context, lang); expanded = false },
                    trailingIcon = { if (lang == current) Text("✓") }
                )
            }
        }
    }
}

