package com.videotranslatorapp;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.BaseActivityEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.modules.core.DeviceEventManagerModule;

public class SystemAudioModule extends ReactContextBaseJavaModule {

    private static final String TAG = "SystemAudioModule";
    private static final int MEDIA_PROJECTION_REQUEST = 2001;
    private static final int SAMPLE_RATE = 16000;
    // AudioPlaybackCapture bazı MediaTek/TECNO cihazlarda mono desteklemez → stereo yaz, mono'ya çevir
    private static final int CHANNEL = AudioFormat.CHANNEL_IN_STEREO;
    private static final int CHANNEL_COUNT = 2;
    private static final int ENCODING = AudioFormat.ENCODING_PCM_16BIT;
    // 1 saniye stereo = 64000 byte (sonra mono'ya çevrilince 32000 byte)
    private static final int CHUNK_SIZE = SAMPLE_RATE * 2 * CHANNEL_COUNT * 1;

    private MediaProjection mediaProjection;
    private AudioRecord audioRecord;
    private Thread recordingThread;
    private volatile boolean isCapturing = false;
    private Promise projectionPromise;

    private final ActivityEventListener activityEventListener = new BaseActivityEventListener() {
        @Override
        public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
            if (requestCode != MEDIA_PROJECTION_REQUEST) return;
            if (resultCode != Activity.RESULT_OK || data == null) {
                if (projectionPromise != null) {
                    projectionPromise.reject("DENIED", "Kullanıcı izni reddetti");
                    projectionPromise = null;
                }
                return;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                MediaProjectionManager mgr = (MediaProjectionManager)
                    getReactApplicationContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
                mediaProjection = mgr.getMediaProjection(resultCode, data);
                if (projectionPromise != null) {
                    projectionPromise.resolve(true);
                    projectionPromise = null;
                }
            }
        }
    };

    public SystemAudioModule(ReactApplicationContext reactContext) {
        super(reactContext);
        reactContext.addActivityEventListener(activityEventListener);
    }

    @Override
    public String getName() { return "SystemAudio"; }

    /** Kulaklık takılı mı? (kablolu veya Bluetooth) */
    @ReactMethod
    public void isHeadsetConnected(Promise promise) {
        AudioManager am = (AudioManager) getReactApplicationContext()
            .getSystemService(Context.AUDIO_SERVICE);
        if (am == null) { promise.resolve(false); return; }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            AudioDeviceInfo[] devices = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
            for (AudioDeviceInfo d : devices) {
                int t = d.getType();
                if (t == AudioDeviceInfo.TYPE_WIRED_HEADSET
                        || t == AudioDeviceInfo.TYPE_WIRED_HEADPHONES
                        || t == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP
                        || t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
                        || t == AudioDeviceInfo.TYPE_USB_HEADSET) {
                    promise.resolve(true);
                    return;
                }
            }
            promise.resolve(false);
        } else {
            promise.resolve(am.isWiredHeadsetOn() || am.isBluetoothA2dpOn());
        }
    }

    /** MediaProjection izni iste (tek seferlik) */
    @ReactMethod
    public void requestProjectionPermission(Promise promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            promise.reject("UNSUPPORTED", "Android 10+ gerekli");
            return;
        }
        Activity activity = getCurrentActivity();
        if (activity == null) { promise.reject("NO_ACTIVITY", "Activity yok"); return; }

        projectionPromise = promise;
        MediaProjectionManager mgr = (MediaProjectionManager)
            getReactApplicationContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        activity.startActivityForResult(mgr.createScreenCaptureIntent(), MEDIA_PROJECTION_REQUEST);
    }

    /** Sistem sesini yakala (AudioPlaybackCapture) */
    @SuppressLint("MissingPermission")
    @ReactMethod
    public void startSystemCapture(Promise promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            promise.reject("UNSUPPORTED", "Android 10+ gerekli");
            return;
        }
        if (mediaProjection == null) {
            promise.reject("NO_PROJECTION", "Önce requestProjectionPermission çağır");
            return;
        }
        if (isCapturing) { promise.resolve(false); return; }

        try {
            AudioPlaybackCaptureConfiguration config =
                new AudioPlaybackCaptureConfiguration.Builder(mediaProjection)
                    .addMatchingUsage(android.media.AudioAttributes.USAGE_MEDIA)
                    .addMatchingUsage(android.media.AudioAttributes.USAGE_GAME)
                    .addMatchingUsage(android.media.AudioAttributes.USAGE_UNKNOWN)
                    .build();

            int bufSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL, ENCODING);
            audioRecord = new AudioRecord.Builder()
                .setAudioFormat(new AudioFormat.Builder()
                    .setEncoding(ENCODING)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(CHANNEL)
                    .build())
                .setBufferSizeInBytes(bufSize * 4)
                .setAudioPlaybackCaptureConfig(config)
                .build();

            isCapturing = true;
            audioRecord.startRecording();
            Log.i(TAG, "Sistem ses yakalama başladı");

            recordingThread = new Thread(() -> captureLoop());
            recordingThread.start();
            promise.resolve(true);

        } catch (Exception e) {
            Log.e(TAG, "Capture başlatma hatası: " + e.getMessage());
            promise.reject("START_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void stopSystemCapture(Promise promise) {
        isCapturing = false;
        if (recordingThread != null) {
            try { recordingThread.join(1000); } catch (InterruptedException ignored) {}
            recordingThread = null;
        }
        if (audioRecord != null) {
            try { audioRecord.stop(); } catch (Exception ignored) {}
            audioRecord.release();
            audioRecord = null;
        }
        Log.i(TAG, "Sistem ses yakalama durduruldu");
        if (promise != null) promise.resolve(true);
    }

    @ReactMethod
    public void releaseProjection() {
        if (mediaProjection != null) {
            mediaProjection.stop();
            mediaProjection = null;
        }
    }

    private void captureLoop() {
        byte[] buffer = new byte[CHUNK_SIZE];
        byte[] accumulator = new byte[0];
        // Mono chunk: stereo'nun yarısı kadar (16kHz * 2byte * 1kanal * 1sn = 32000)
        final int MONO_CHUNK = SAMPLE_RATE * 2 * 1;

        while (isCapturing && audioRecord != null) {
            int read = audioRecord.read(buffer, 0, buffer.length);
            if (read <= 0) continue;

            // Stereo → Mono dönüşümü (sol+sağ kanalın ortalaması)
            byte[] mono = stereoToMono(buffer, read);

            // Biriktir
            byte[] merged = new byte[accumulator.length + mono.length];
            System.arraycopy(accumulator, 0, merged, 0, accumulator.length);
            System.arraycopy(mono, 0, merged, accumulator.length, mono.length);
            accumulator = merged;

            // 1 saniyelik mono chunk hazır mı?
            if (accumulator.length >= MONO_CHUNK) {
                byte[] chunk = new byte[MONO_CHUNK];
                System.arraycopy(accumulator, 0, chunk, 0, MONO_CHUNK);

                byte[] remaining = new byte[accumulator.length - MONO_CHUNK];
                System.arraycopy(accumulator, MONO_CHUNK, remaining, 0, remaining.length);
                accumulator = remaining;

                String base64 = Base64.encodeToString(chunk, Base64.NO_WRAP);
                emitAudioData(base64);
            }
        }
    }

    /** Stereo PCM 16-bit → Mono PCM 16-bit (L+R ortalaması) */
    private byte[] stereoToMono(byte[] stereo, int length) {
        // Her sample 2 byte, stereo = L(2byte) + R(2byte) = 4 byte/frame
        int frames = length / 4;
        byte[] mono = new byte[frames * 2];
        for (int i = 0; i < frames; i++) {
            short left  = (short) ((stereo[i * 4 + 1] << 8) | (stereo[i * 4] & 0xFF));
            short right = (short) ((stereo[i * 4 + 3] << 8) | (stereo[i * 4 + 2] & 0xFF));
            short avg   = (short) ((left + right) / 2);
            mono[i * 2]     = (byte) (avg & 0xFF);
            mono[i * 2 + 1] = (byte) ((avg >> 8) & 0xFF);
        }
        return mono;
    }

    private void emitAudioData(String base64) {
        try {
            getReactApplicationContext()
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onSystemAudioData", base64);
        } catch (Exception e) {
            Log.w(TAG, "Event emit hatası: " + e.getMessage());
        }
    }

    @Override
    public void onCatalystInstanceDestroy() {
        stopSystemCapture(null);
        releaseProjection();
    }
}
