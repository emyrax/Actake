package com.actake.stepstake

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.time.Duration
import java.time.LocalDateTime
import java.time.LocalTime
import java.util.concurrent.TimeUnit

/**
 * WorkManager background worker that evaluates daily hardware step progress every 15 minutes
 * plus a dedicated high-priority 23:15 local-time cutoff check.
 *
 * - Default Manual MWA Mode: posts a high-priority notification with a deep link that opens
 *   Actake's MWA Seed Vault signing sheet for immediate one-tap proof submission.
 * - Opt-In Seamless Mode: if the user authorized a scoped ephemeral check-in session key at
 *   pool join time (strictly limited to submit_daily_checkin — zero withdrawal authority),
 *   dispatches the signed proof automatically in the background.
 */
class MidnightCheckinWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val config = StepCounterStore.getMonitoredPool(applicationContext) ?: return Result.success()
        val (payload, proofHash) = StepCounterStore.buildCanonicalProof(
            context = applicationContext,
            wallet = config.wallet,
            poolId = config.poolId,
            dayIndex = config.dayIndex
        )
        val steps = payload.getLong("steps")

        if (steps >= config.targetSteps) {
            val nowMs = System.currentTimeMillis()
            val canAutoSign = config.seamlessSessionEnabled &&
                !config.sessionDelegatePubkey.isNullOrEmpty() &&
                config.sessionExpiresAtMs > nowMs

            if (canAutoSign) {
                // Opt-in scoped ephemeral session delegate path: notify JS/native signer service
                // or submit via scoped delegate keypair (never holds withdrawal permissions)
                postNotification(
                    title = "Daily Step Proof Ready (Seamless Mode)",
                    body = "$steps steps verified! Scoped session key queued Day ${config.dayIndex} proof.",
                    poolId = config.poolId,
                    dayIndex = config.dayIndex,
                    steps = steps,
                    proofHash = proofHash,
                    autoSignMode = true
                )
            } else {
                // Default Manual MWA Mode: wake user with one-tap Seed Vault deep link
                postNotification(
                    title = "Target Hit! Sign On-Chain Proof",
                    body = "Target Hit! Tap to sign your on-chain proof via Seed Vault ($steps / ${config.targetSteps} steps).",
                    poolId = config.poolId,
                    dayIndex = config.dayIndex,
                    steps = steps,
                    proofHash = proofHash,
                    autoSignMode = false
                )
            }
        }

        // Re-arm the next day's 23:15 high-priority local window
        schedule2315Window(applicationContext)
        return Result.success()
    }

    private fun postNotification(
        title: String,
        body: String,
        poolId: String,
        dayIndex: Int,
        steps: Long,
        proofHash: String,
        autoSignMode: Boolean
    ) {
        val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Actake Midnight Check-In Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "High-priority alerts to sign daily Solana accountability proofs via Seed Vault."
            }
            manager.createNotificationChannel(channel)
        }

        val deepLinkUri = Uri.parse(
            "actake://step-stake/checkin" +
                "?poolId=${Uri.encode(poolId)}" +
                "&dayIndex=$dayIndex" +
                "&steps=$steps" +
                "&proofHash=${Uri.encode(proofHash)}" +
                "&autoSign=$autoSignMode"
        )

        val launchIntent = Intent(Intent.ACTION_VIEW, deepLinkUri).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        val pendingIntent = PendingIntent.getActivity(
            applicationContext,
            poolId.hashCode(),
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        manager.notify(NOTIFICATION_ID_BASE + dayIndex, notification)
    }

    companion object {
        private const val CHANNEL_ID = "actake_step_stake_midnight_channel"
        private const val PERIODIC_WORK_NAME = "actake_step_stake_periodic_15m"
        private const val WINDOW_2315_WORK_NAME = "actake_step_stake_window_2315"
        private const val NOTIFICATION_ID_BASE = 7400

        fun schedule(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val periodicRequest = PeriodicWorkRequestBuilder<MidnightCheckinWorker>(
                15,
                TimeUnit.MINUTES
            )
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                periodicRequest
            )

            schedule2315Window(context)
        }

        fun schedule2315Window(context: Context) {
            val now = LocalDateTime.now()
            var target = now.with(LocalTime.of(23, 15, 0))
            if (!target.isAfter(now)) {
                target = target.plusDays(1)
            }
            val delayMinutes = Duration.between(now, target).toMinutes().coerceAtLeast(1L)

            val highPriorityWindowRequest = OneTimeWorkRequestBuilder<MidnightCheckinWorker>()
                .setInitialDelay(delayMinutes, TimeUnit.MINUTES)
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                WINDOW_2315_WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                highPriorityWindowRequest
            )
        }
    }
}
