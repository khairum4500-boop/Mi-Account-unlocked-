package com.example

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.example.util.DeviceIdProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ExampleRobolectricTest {

    @Test
    fun testAppName() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val appName = context.getString(R.string.app_name)
        assertEquals("MI Unlock", appName)
    }

    @Test
    fun testDeviceIdGeneration() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val id1 = DeviceIdProvider.getDeviceId(context)
        val id2 = DeviceIdProvider.getDeviceId(context)
        assertNotNull(id1)
        assertTrue("Device ID should start with MI-", id1.startsWith("MI-"))
        assertEquals("Device ID should be stable across calls", id1, id2)
    }
}
