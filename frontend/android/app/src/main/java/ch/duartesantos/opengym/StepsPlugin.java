package ch.duartesantos.opengym;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Today's step count from the device's own hardware step counter (Sensor.TYPE_STEP_COUNTER) —
 * no Health Connect, no Google Fit account, nothing openGym's server ever sees.
 *
 * The sensor runs continuously at the OS level, whether or not this app is open, but it only
 * ever reports one number: a running total since the phone's last reboot, with no history API
 * to ask "how many was that as of midnight". So "today's steps" here is that total minus a
 * baseline captured the first time the app reads the sensor on a given day (see readOnce) —
 * whichever cumulative count is on the sensor the first time you open openGym that day becomes
 * "zero steps so far". That means steps taken before your first open of the day are not
 * retroactively counted; there is no background service keeping a live baseline (a persistent
 * foreground service just to shave off a few steps' inaccuracy is not a trade worth making).
 * Open the app once earlier in the day for the most accurate count.
 */
@CapacitorPlugin(
    name = "Steps",
    permissions = { @Permission(strings = { Manifest.permission.ACTIVITY_RECOGNITION }, alias = "activity") }
)
public class StepsPlugin extends Plugin {

    private static final String PREFS = "opengym_steps";
    private static final long SENSOR_TIMEOUT_MS = 2000;

    private SensorManager sensorManager;
    private Sensor stepCounter;

    @Override
    public void load() {
        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        stepCounter = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", stepCounter != null);
        call.resolve(ret);
    }

    @PluginMethod
    public void getTodaySteps(PluginCall call) {
        if (stepCounter == null) {
            call.reject("No step counter sensor on this device");
            return;
        }
        // Below Android 10 (API 29) the step counter needs no runtime permission at all;
        // ACTIVITY_RECOGNITION only started gating it from Q onward.
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.Q || getPermissionState("activity") == PermissionState.GRANTED) {
            readOnce(call);
        } else {
            requestPermissionForAlias("activity", call, "stepsPermissionCallback");
        }
    }

    @PermissionCallback
    private void stepsPermissionCallback(PluginCall call) {
        if (getPermissionState("activity") == PermissionState.GRANTED) {
            readOnce(call);
        } else {
            call.reject("Activity recognition permission was not granted");
        }
    }

    // A fresh SensorEvent normally arrives within a moment of registering — the sensor
    // delivers its last known cumulative value promptly rather than waiting for the next
    // actual step. The timeout is only a safety net so a slow/unusual device can't hang the
    // JS call forever; it resolves to today's count-so-far (0 on a device that never reports).
    private void readOnce(PluginCall call) {
        final boolean[] settled = { false };
        final SensorEventListener[] listenerRef = new SensorEventListener[1];
        final Handler handler = new Handler(Looper.getMainLooper());
        final Runnable timeout = () -> {
            if (settled[0]) return;
            settled[0] = true;
            sensorManager.unregisterListener(listenerRef[0]);
            call.resolve(zeroStepsResult());
        };
        listenerRef[0] = new SensorEventListener() {
            @Override
            public void onSensorChanged(SensorEvent event) {
                if (settled[0]) return;
                settled[0] = true;
                handler.removeCallbacks(timeout);
                sensorManager.unregisterListener(this);
                call.resolve(todayStepsFrom(Math.round(event.values[0])));
            }

            @Override
            public void onAccuracyChanged(Sensor sensor, int accuracy) {}
        };
        sensorManager.registerListener(listenerRef[0], stepCounter, SensorManager.SENSOR_DELAY_NORMAL);
        handler.postDelayed(timeout, SENSOR_TIMEOUT_MS);
    }

    private String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private JSObject zeroStepsResult() {
        JSObject ret = new JSObject();
        ret.put("steps", 0);
        return ret;
    }

    private JSObject todayStepsFrom(int cumulative) {
        SharedPreferences p = prefs();
        String today = today();
        int baseline;
        if (today.equals(p.getString("date", null))) {
            baseline = p.getInt("baseline", cumulative);
        } else {
            // First reading of a new day: whatever the sensor already reads becomes "0 steps
            // today" going forward, since there is no way to ask it what it read at midnight.
            baseline = cumulative;
            p.edit().putString("date", today).putInt("baseline", baseline).apply();
        }
        JSObject ret = new JSObject();
        ret.put("steps", Math.max(0, cumulative - baseline));
        return ret;
    }
}
