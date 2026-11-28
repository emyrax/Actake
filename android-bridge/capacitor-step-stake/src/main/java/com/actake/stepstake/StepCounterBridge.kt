package com.actake.stepstake

import android.Manifest
import android.content.Context
import android.content.SharedPreferences
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONObject
import java.security.MessageDigest
import java.time.LocalDate
import java.time.ZoneId

/**
 * Encrypted, reboot-aware daily hardware step store backed by EncryptedSharedPreferences.
 * Prevents clock-rollback and reboot delta spoofing by tracking both local calendar date,
 * Settings.Global.BOOT_COUNT, and SystemClock.elapsedRealtime().
 */
object StepCounterStore {
    private const val PREFS_NAME = "actake_step_stake_encrypted_prefs"
    private const val KEY_DAY_ISO = "baseline_day_iso"
    private const val KEY_BASELINE_RAW = "baseline_raw_steps"
    private const val KEY_LAST_RAW = "last_raw_steps"
    private const val KEY_ACCUMULATED_BEFORE_REBOOT = "accumulated_before_reboot"
    private const val KEY_LAST_BOOT_COUNT = "last_boot_count"
    private const val KEY_LAST_ELAPSED_MS = "last_elapsed_ms"
    private const val KEY_LAST_SENSOR_TS = "last_sensor_ts"

    // Pool monitoring & optional scoped ephemeral session key
    private const val KEY_MONITORED_POOL_ID = "monitored_pool_id"
    private const val KEY_MONITORED_WALLET = "monitored_wallet"
    private const val KEY_MONITORED_DAY_INDEX = "monitored_day_index"
    private const val KEY_MONITORED_TARGET_STEPS = "monitored_target_steps"
    private const val KEY_SESSION_KEY_PUBKEY = "ephemeral_session_pubkey"
    private const val KEY_SESSION_KEY_EXPIRES_AT = "ephemeral_session_expires_at"
    private const val KEY_SESSION_KEY_MODE = "ephemeral_session_enabled"
    private const val KEY_RPC_ENDPOINT = "solana_rpc_endpoint"

    fun encryptedPrefs(context: Context): SharedPreferences {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        return EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun getDeviceBootCount(context: Context): Int {
        return try {
            Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, 1)
        } catch (_: Throwable) {
            1
        }
    }

    @Synchronized
    fun recordHardwareStepEvent(context: Context, cumulativeStepsSinceBoot: Long, sensorTimestampNs: Long): Long {
        val prefs = encryptedPrefs(context)
        val todayIso = LocalDate.now(ZoneId.systemDefault()).toString()
        val currentBootCount = getDeviceBootCount(context)
        val currentElapsedMs = SystemClock.elapsedRealtime()

        val savedDayIso = prefs.getString(KEY_DAY_ISO, null)
        val savedBootCount = prefs.getInt(KEY_LAST_BOOT_COUNT, -1)
        val savedElapsedMs = prefs.getLong(KEY_LAST_ELAPSED_MS, -1L)
        val lastRaw = prefs.getLong(KEY_LAST_RAW, -1L)

        val editor = prefs.edit()
        var baselineRaw = prefs.getLong(KEY_BASELINE_RAW, -1L)
        var accumulated = prefs.getLong(KEY_ACCUMULATED_BEFORE_REBOOT, 0L)

        if (savedDayIso != todayIso || baselineRaw < 0L) {
            // New local calendar day (00:00 rollover) — snapshot fresh encrypted baseline
            baselineRaw = cumulativeStepsSinceBoot
            accumulated = 0L
            editor.putString(KEY_DAY_ISO, todayIso)
            editor.putLong(KEY_BASELINE_RAW, baselineRaw)
            editor.putLong(KEY_ACCUMULATED_BEFORE_REBOOT, 0L)
        } else {
            // Detect reboot via BOOT_COUNT increment, elapsedRealtime rollback, or hardware counter reset
            val rebootDetected = (savedBootCount > 0 && currentBootCount != savedBootCount) ||
                (savedElapsedMs > 0L && currentElapsedMs < savedElapsedMs) ||
                (lastRaw >= 0L && cumulativeStepsSinceBoot < lastRaw)

            if (rebootDetected) {
                val preRebootDelta = if (lastRaw >= baselineRaw) lastRaw - baselineRaw else 0L
                accumulated += preRebootDelta
                baselineRaw = 0L
                editor.putLong(KEY_ACCUMULATED_BEFORE_REBOOT, accumulated)
                editor.putLong(KEY_BASELINE_RAW, 0L)
            }
        }

        val currentDelta = (cumulativeStepsSinceBoot - baselineRaw).coerceAtLeast(0L)
        val totalDailySteps = accumulated + currentDelta

        editor.putLong(KEY_LAST_RAW, cumulativeStepsSinceBoot)
        editor.putInt(KEY_LAST_BOOT_COUNT, currentBootCount)
        editor.putLong(KEY_LAST_ELAPSED_MS, currentElapsedMs)
        editor.putLong(KEY_LAST_SENSOR_TS, sensorTimestampNs)
        editor.apply()

        return totalDailySteps
    }

    fun getCurrentDailySteps(context: Context): Long {
        val prefs = encryptedPrefs(context)
        val todayIso = LocalDate.now(ZoneId.systemDefault()).toString()
        if (prefs.getString(KEY_DAY_ISO, null) != todayIso) {
            return 0L
        }
        val baselineRaw = prefs.getLong(KEY_BASELINE_RAW, -1L)
        val lastRaw = prefs.getLong(KEY_LAST_RAW, -1L)
        val accumulated = prefs.getLong(KEY_ACCUMULATED_BEFORE_REBOOT, 0L)
        if (baselineRaw < 0L || lastRaw < 0L) return accumulated
        return accumulated + (lastRaw - baselineRaw).coerceAtLeast(0L)
    }

    fun getLastSensorTimestamp(context: Context): Long {
        return encryptedPrefs(context).getLong(KEY_LAST_SENSOR_TS, System.currentTimeMillis() * 1_000_000L)
    }

    fun buildCanonicalProof(
        context: Context,
        wallet: String,
        poolId: String,
        dayIndex: Int
    ): Pair<JSONObject, String> {
        val steps = getCurrentDailySteps(context)
        val sensorTimestamp = getLastSensorTimestamp(context)
        val deviceBootCount = getDeviceBootCount(context)

        // Canonical deterministic key order for cross-platform SHA-256 verification
        val canonicalJson =
            """{"wallet":"$wallet","poolId":"$poolId","dayIndex":$dayIndex,"steps":$steps,"sensorTimestamp":$sensorTimestamp,"deviceBootCount":$deviceBootCount}"""
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(canonicalJson.toByteArray(Charsets.UTF_8))
        val proofHashHex = digest.joinToString("") { "%02x".format(it) }

        val payload = JSONObject().apply {
            put("wallet", wallet)
            put("poolId", poolId)
            put("dayIndex", dayIndex)
            put("steps", steps)
            put("sensorTimestamp", sensorTimestamp)
            put("deviceBootCount", deviceBootCount)
        }
        return Pair(payload, proofHashHex)
    }

    fun saveMonitoredPool(
        context: Context,
        poolId: String,
        wallet: String,
        dayIndex: Int,
        targetSteps: Long,
        rpcEndpoint: String
    ) {
        encryptedPrefs(context).edit()
            .putString(KEY_MONITORED_POOL_ID, poolId)
            .putString(KEY_MONITORED_WALLET, wallet)
            .putInt(KEY_MONITORED_DAY_INDEX, dayIndex)
            .putLong(KEY_MONITORED_TARGET_STEPS, targetSteps)
            .putString(KEY_RPC_ENDPOINT, rpcEndpoint)
            .apply()
    }

    fun getMonitoredPool(context: Context): MonitoredPoolConfig? {
        val prefs = encryptedPrefs(context)
        val poolId = prefs.getString(KEY_MONITORED_POOL_ID, null) ?: return null
        val wallet = prefs.getString(KEY_MONITORED_WALLET, null) ?: return null
        return MonitoredPoolConfig(
            poolId = poolId,
            wallet = wallet,
            dayIndex = prefs.getInt(KEY_MONITORED_DAY_INDEX, 1),
            targetSteps = prefs.getLong(KEY_MONITORED_TARGET_STEPS, 8000L),
            rpcEndpoint = prefs.getString(KEY_RPC_ENDPOINT, "https://api.devnet.solana.com")
                ?: "https://api.devnet.solana.com",
            seamlessSessionEnabled = prefs.getBoolean(KEY_SESSION_KEY_MODE, false),
            sessionDelegatePubkey = prefs.getString(KEY_SESSION_KEY_PUBKEY, null),
            sessionExpiresAtMs = prefs.getLong(KEY_SESSION_KEY_EXPIRES_AT, 0L)
        )
    }

    fun setEphemeralSessionKey(context: Context, pubkey: String, expiresAtMs: Long) {
        encryptedPrefs(context).edit()
            .putBoolean(KEY_SESSION_KEY_MODE, true)
            .putString(KEY_SESSION_KEY_PUBKEY, pubkey)
            .putLong(KEY_SESSION_KEY_EXPIRES_AT, expiresAtMs)
            .apply()
    }

    fun clearEphemeralSessionKey(context: Context) {
        encryptedPrefs(context).edit()
            .putBoolean(KEY_SESSION_KEY_MODE, false)
            .remove(KEY_SESSION_KEY_PUBKEY)
            .remove(KEY_SESSION_KEY_EXPIRES_AT)
            .apply()
    }
}

data class MonitoredPoolConfig(
    val poolId: String,
    val wallet: String,
    val dayIndex: Int,
    val targetSteps: Long,
    val rpcEndpoint: String,
    val seamlessSessionEnabled: Boolean,
    val sessionDelegatePubkey: String?,
    val sessionExpiresAtMs: Long
)

@CapacitorPlugin(
    name = "StepCounterBridge",
    permissions = [
        Permission(
            alias = "activityRecognition",
            strings = [Manifest.permission.ACTIVITY_RECOGNITION]
        )
    ]
)
class StepCounterBridge : Plugin(), SensorEventListener {

    private var sensorManager: SensorManager? = null
    private var stepCounterSensor: Sensor? = null
    private var isListening: Boolean = false

    override fun load() {
        super.load()
        sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        stepCounterSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    }

    @PluginMethod
    fun startStepTracking(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            getPermissionState("activityRecognition") != PermissionState.GRANTED
        ) {
            requestPermissionForAlias("activityRecognition", call, "activityPermissionCallback")
            return
        }
        registerHardwareSensor(call)
    }

    @PermissionCallback
    private fun activityPermissionCallback(call: PluginCall) {
        if (getPermissionState("activityRecognition") == PermissionState.GRANTED) {
            registerHardwareSensor(call)
        } else {
            call.reject("ACTIVITY_RECOGNITION permission is required to read hardware steps.")
        }
    }

    private fun registerHardwareSensor(call: PluginCall) {
        val manager = sensorManager
        val sensor = stepCounterSensor
        if (manager == null || sensor == null) {
            call.reject("Hardware TYPE_STEP_COUNTER sensor is unavailable on this device.")
            return
        }
        if (!isListening) {
            manager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL)
            isListening = true
        }
        val ret = JSObject().apply {
            put("tracking", true)
            put("dailySteps", StepCounterStore.getCurrentDailySteps(context))
            put("deviceBootCount", StepCounterStore.getDeviceBootCount(context))
        }
        call.resolve(ret)
    }

    @PluginMethod
    fun getDailyStepProof(call: PluginCall) {
        val wallet = call.getString("wallet")?.trim()
        val poolId = call.getString("poolId")?.trim()
        val dayIndex = call.getInt("dayIndex") ?: 1

        if (wallet.isNullOrEmpty() || poolId.isNullOrEmpty()) {
            call.reject("Both wallet and poolId are required to compute a step proof.")
            return
        }

        val (payload, proofHash) = StepCounterStore.buildCanonicalProof(
            context = context,
            wallet = wallet,
            poolId = poolId,
            dayIndex = dayIndex
        )

        val result = JSObject().apply {
            put("wallet", payload.getString("wallet"))
            put("poolId", payload.getString("poolId"))
            put("dayIndex", payload.getInt("dayIndex"))
            put("steps", payload.getLong("steps"))
            put("sensorTimestamp", payload.getLong("sensorTimestamp"))
            put("deviceBootCount", payload.getInt("deviceBootCount"))
            put("proofHash", proofHash)
            put("sensorAvailable", stepCounterSensor != null)
        }
        call.resolve(result)
    }

    @PluginMethod
    fun scheduleMidnightMonitor(call: PluginCall) {
        val poolId = call.getString("poolId")?.trim()
        val wallet = call.getString("wallet")?.trim()
        val dayIndex = call.getInt("dayIndex") ?: 1
        val targetSteps = call.getInt("targetSteps")?.toLong() ?: 8000L
        val rpcEndpoint = call.getString("rpcEndpoint") ?: "https://api.devnet.solana.com"

        if (poolId.isNullOrEmpty() || wallet.isNullOrEmpty()) {
            call.reject("poolId and wallet are required to schedule WorkManager monitoring.")
            return
        }

        StepCounterStore.saveMonitoredPool(context, poolId, wallet, dayIndex, targetSteps, rpcEndpoint)
        MidnightCheckinWorker.schedule(context)

        val ret = JSObject().apply {
            put("scheduled", true)
            put("poolId", poolId)
            put("targetSteps", targetSteps)
            put("windowLocalTime", "23:15")
        }
        call.resolve(ret)
    }

    @PluginMethod
    fun authorizeEphemeralSessionKey(call: PluginCall) {
        val delegatePubkey = call.getString("delegatePubkey")?.trim()
        val expiresAtMs = call.getLong("expiresAtMs") ?: (System.currentTimeMillis() + 7L * 86_400_000L)
        if (delegatePubkey.isNullOrEmpty()) {
            call.reject("delegatePubkey is required.")
            return
        }
        StepCounterStore.setEphemeralSessionKey(context, delegatePubkey, expiresAtMs)
        call.resolve(JSObject().apply {
            put("authorized", true)
            put("delegatePubkey", delegatePubkey)
            put("expiresAtMs", expiresAtMs)
        })
    }

    @PluginMethod
    fun revokeEphemeralSessionKey(call: PluginCall) {
        StepCounterStore.clearEphemeralSessionKey(context)
        call.resolve(JSObject().apply { put("revoked", true) })
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null || event.sensor.type != Sensor.TYPE_STEP_COUNTER) return
        val cumulativeSteps = event.values.firstOrNull()?.toLong() ?: return
        val dailySteps = StepCounterStore.recordHardwareStepEvent(context, cumulativeSteps, event.timestamp)

        val payload = JSObject().apply {
            put("steps", dailySteps)
            put("sensorTimestamp", event.timestamp)
            put("deviceBootCount", StepCounterStore.getDeviceBootCount(context))
        }
        notifyListeners("stepDeltaUpdated", payload)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // No-op
    }

    override fun handleOnDestroy() {
        if (isListening) {
            sensorManager?.unregisterListener(this)
            isListening = false
        }
        super.handleOnDestroy()
    }
}
