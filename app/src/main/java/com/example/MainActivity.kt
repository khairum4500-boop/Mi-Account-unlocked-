package com.example

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Announcement
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContactSupport
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.ui.components.AdminContactCard
import com.example.ui.screens.AuthorizationScreen
import com.example.ui.screens.MiAccountUnlockedScreen
import com.example.ui.theme.MiOrange
import com.example.ui.theme.MyApplicationTheme
import com.example.ui.theme.TechCyan
import com.example.ui.theme.TechDarkBg
import com.example.ui.theme.TechDarkSurface
import com.example.ui.viewmodel.MainViewModel
import dev.rohitverma882.miunlock_account_v2.LoginData
import dev.rohitverma882.miunlock_account_v2.LoginActivity

class MainActivity : ComponentActivity() {

    private var loginDataState = mutableStateOf<LoginData?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleIntent(intent)

        setContent {
            MyApplicationTheme {
                val currentLoginData by loginDataState
                MiUnlockApp(
                    initialLoginData = currentLoginData,
                    onOpenLogin = { openLoginActivity(true) },
                    onLogout = {
                        loginDataState.value = null
                        openLoginActivity(false)
                    }
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        @Suppress("DEPRECATION")
        val data = intent?.getParcelableExtra<LoginData>("data")
        if (data != null) {
            loginDataState.value = data
        }
    }

    private fun openLoginActivity(isLogin: Boolean) {
        val intent = Intent(this, LoginActivity::class.java).apply {
            putExtra("login", isLogin)
        }
        startActivity(intent)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MiUnlockApp(
    viewModel: MainViewModel = viewModel(),
    initialLoginData: LoginData? = null,
    onOpenLogin: () -> Unit = {},
    onLogout: () -> Unit = {}
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    var showAdminContactDialog by remember { mutableStateOf(false) }

    LaunchedEffect(uiState.errorMessage) {
        uiState.errorMessage?.let {
            snackbarHostState.showSnackbar(it, duration = SnackbarDuration.Short)
            viewModel.clearMessage()
        }
    }

    LaunchedEffect(uiState.successMessage) {
        uiState.successMessage?.let {
            snackbarHostState.showSnackbar(it, duration = SnackbarDuration.Short)
            viewModel.clearMessage()
        }
    }

    val isApproved = uiState.license?.status == "APPROVED" &&
            !uiState.isMaintenance &&
            !uiState.isUpdateRequired

    // Broadcast Announcement Dialog
    if (uiState.activeAnnouncement != null) {
        AlertDialog(
            onDismissRequest = { viewModel.dismissAnnouncement() },
            icon = {
                Icon(
                    imageVector = Icons.Default.Announcement,
                    contentDescription = "Announcement",
                    tint = TechCyan
                )
            },
            title = {
                Text(
                    text = "Administrator Announcement",
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            },
            text = {
                Text(
                    text = uiState.activeAnnouncement!!,
                    color = Color(0xFFD1D5DB)
                )
            },
            confirmButton = {
                TextButton(onClick = { viewModel.dismissAnnouncement() }) {
                    Text("OK", color = TechCyan)
                }
            },
            containerColor = TechDarkSurface,
            shape = RoundedCornerShape(16.dp)
        )
    }

    // Admin Contact Dialog
    if (showAdminContactDialog) {
        AlertDialog(
            onDismissRequest = { showAdminContactDialog = false },
            title = {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Contact Administrator",
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                        modifier = Modifier.weight(1f)
                    )
                    IconButton(
                        onClick = { showAdminContactDialog = false },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Close",
                            tint = Color(0xFF9CA3AF)
                        )
                    }
                }
            },
            text = {
                AdminContactCard(
                    telegram = uiState.appConfig.adminTelegram,
                    contactNumber = uiState.appConfig.adminContact,
                    whatsapp = uiState.appConfig.adminWhatsapp,
                    email = uiState.appConfig.adminEmail,
                    deviceId = uiState.deviceId
                )
            },
            confirmButton = {},
            containerColor = TechDarkSurface,
            shape = RoundedCornerShape(16.dp)
        )
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(28.dp)
                                .background(MiOrange, RoundedCornerShape(6.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "MI",
                                fontWeight = FontWeight.Black,
                                fontSize = 14.sp,
                                color = Color.White
                            )
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "MI Unlock Tool",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = { showAdminContactDialog = true },
                        modifier = Modifier.testTag("topbar_btn_contact")
                    ) {
                        Icon(
                            imageVector = Icons.Default.ContactSupport,
                            contentDescription = "Admin Contact",
                            tint = TechCyan
                        )
                    }
                    IconButton(
                        onClick = { viewModel.refreshAll() },
                        modifier = Modifier.testTag("topbar_btn_refresh")
                    ) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Refresh",
                            tint = Color.White
                        )
                    }
                },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                    containerColor = TechDarkSurface
                )
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = TechDarkBg
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            if (!isApproved) {
                // GATE 1: Authorization & Approval Lock
                AuthorizationScreen(
                    state = uiState,
                    onSubmitApproval = { name, contact, telegram, whatsapp ->
                        viewModel.submitApprovalRequest(name, contact, telegram, whatsapp)
                    },
                    onRefresh = { viewModel.refreshAll() }
                )
            } else {
                // GATE 2: Xiaomi Mi Account Login & Unlock Token Extraction
                MiAccountUnlockedScreen(
                    state = uiState,
                    loginData = initialLoginData,
                    onOpenLogin = onOpenLogin,
                    onLogout = onLogout
                )
            }
        }
    }
}
