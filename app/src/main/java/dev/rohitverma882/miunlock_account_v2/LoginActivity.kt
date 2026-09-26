package dev.rohitverma882.miunlock_account_v2

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.os.Parcelable
import android.util.Log
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.webkit.CookieManagerCompat
import androidx.webkit.WebViewClientCompat
import androidx.webkit.WebViewFeature

class LoginActivity : ComponentActivity() {

    companion object {
        const val TAG = "LoginActivity"
        const val loginUrl = "https://account.xiaomi.com/pass/serviceLogin?sid=unlockApi&json=false&passive=true&hidden=false&_snsDefault=facebook&checkSafePhone=true&_locale=en"
    }

    private var isLogin = true
    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        isLogin = intent.getBooleanExtra("login", true)

        val frame = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        frame.addView(webView)
        setContentView(frame)

        if (!isLogin) {
            logoutWebView()
        }
        setupWebView()
    }

    private fun logoutWebView() {
        if (!isLogin) {
            val cookieManager = CookieManager.getInstance()
            cookieManager.removeSessionCookies(null)
            cookieManager.removeAllCookies(null)
            cookieManager.flush()
            webView.clearCache(true)
            webView.clearHistory()
            webView.clearFormData()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.webViewClient = MiWebViewClient()
        webView.loadUrl(loginUrl)
        webView.setInitialScale(1)

        val settings = webView.settings
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.javaScriptEnabled = true
        settings.setSupportZoom(true)
        settings.builtInZoomControls = true
        settings.displayZoomControls = false
        settings.domStorageEnabled = true
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    private class MiWebViewClient : WebViewClientCompat() {
        private var deviceId: String? = null
        private var passToken: String? = null
        private var userId: String? = null

        fun checkLogin(view: WebView) {
            if (!passToken.isNullOrEmpty() && !userId.isNullOrEmpty() && !deviceId.isNullOrEmpty()) {
                val loginData = LoginData(passToken!!, userId!!, deviceId!!)
                val context = view.context
                if (context is LoginActivity && !context.isFinishing) {
                    val intent = Intent(context, com.example.MainActivity::class.java).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                        putExtra("data", loginData as Parcelable)
                    }
                    context.startActivity(intent)
                    context.finish()
                }
            }
        }

        fun extractCookies(cookie: String): Boolean {
            val parts = cookie.split("=", limit = 2)
            if (parts.size < 2) return false
            val key = parts[0].trim()
            val value = parts[1].trim()
            when (key) {
                "deviceId" -> deviceId = value
                "userId" -> userId = value
                "passToken" -> passToken = value
            }
            return true
        }

        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
            super.onPageStarted(view, url, favicon)
        }

        override fun onPageFinished(view: WebView?, url: String?) {
            super.onPageFinished(view, url)
            Log.d(TAG, "onPageFinished: Url: $url")
            val effectiveUrl = url ?: loginUrl
            if (view != null) {
                scanCookies(view, effectiveUrl)
                checkLogin(view)
            }
        }

        fun scanCookies(webView: WebView, url: String) {
            val cookieManager = CookieManager.getInstance()
            cookieManager.setAcceptCookie(true)
            cookieManager.setAcceptThirdPartyCookies(webView, true)
            val cookies = cookieManager.getCookie(url) ?: ""
            val cookieList = if (cookies.isNotEmpty()) cookies.split(";") else emptyList()

            if (cookieList.isEmpty() && WebViewFeature.isFeatureSupported(WebViewFeature.GET_COOKIE_INFO)) {
                val infoList = CookieManagerCompat.getCookieInfo(cookieManager, url)
                for (item in infoList) {
                    extractCookies(item)
                }
                return
            }

            for (cookie in cookieList) {
                if (cookie.contains(";")) {
                    cookie.split(";").forEach { extractCookies(it) }
                } else {
                    extractCookies(cookie)
                }
            }
        }

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (request.isRedirect) {
                view.loadUrl(request.url.toString())
                return true
            }
            return super.shouldOverrideUrlLoading(view, request)
        }
    }
}
