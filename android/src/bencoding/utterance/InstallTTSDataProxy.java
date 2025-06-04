package bencoding.utterance;

import android.app.Activity;
import android.content.Intent;
import android.speech.tts.TextToSpeech;
import android.util.Log;

import org.appcelerator.kroll.KrollDict;
import org.appcelerator.kroll.KrollPropertyChange;
import org.appcelerator.kroll.KrollProxy;
import org.appcelerator.kroll.KrollProxyListener;
import org.appcelerator.kroll.annotations.Kroll;
import org.appcelerator.titanium.TiApplication;
import org.appcelerator.titanium.util.TiActivityResultHandler;
import org.appcelerator.titanium.util.TiActivitySupport;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

@Kroll.proxy(creatableInModule = UtteranceModule.class)
public class InstallTTSDataProxy extends KrollProxy implements TiActivityResultHandler, KrollProxyListener {

    private static final int CHECK_INSTALL_INTENT_ID = 44400;
    private static final int INSTALL_INTENT_ID = 54400;
    private static final String EVENT_INSTALL_CHECK = "installcheck";
    private static final String EVENT_INSTALL_COMPLETE = "installcomplete";

    public InstallTTSDataProxy() {
        super();
    }

    @Kroll.method
    public void checkDataInstalled() {
        try {
            Intent checkTTSIntent = new Intent();
            checkTTSIntent.setAction(TextToSpeech.Engine.ACTION_CHECK_TTS_DATA);

            final Activity activity = TiApplication.getAppCurrentActivity();
            if (activity == null) {
                Log.e(UtteranceModule.MODULE_FULL_NAME, "Current activity is null");
                fireError(EVENT_INSTALL_CHECK, CHECK_INSTALL_INTENT_ID, "No current activity available");
                return;
            }

            final TiActivitySupport activitySupport = (TiActivitySupport) activity;
            activitySupport.launchActivityForResult(checkTTSIntent, CHECK_INSTALL_INTENT_ID, this);
        } catch (Exception e) {
            Log.e(UtteranceModule.MODULE_FULL_NAME, "Error checking TTS data: " + e.getMessage());
            fireError(EVENT_INSTALL_CHECK, CHECK_INSTALL_INTENT_ID, e.getMessage());
        }
    }

    // Keep old method for compatibility
    @Kroll.method
    @Deprecated
    public void CheckDataInstalled() {
        checkDataInstalled();
    }

    @Kroll.method
    public void installData() {
        try {
            Intent installTTSIntent = new Intent();
            installTTSIntent.setAction(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA);

            final Activity activity = TiApplication.getAppCurrentActivity();
            if (activity == null) {
                Log.e(UtteranceModule.MODULE_FULL_NAME, "Current activity is null");
                fireError(EVENT_INSTALL_COMPLETE, INSTALL_INTENT_ID, "No current activity available");
                return;
            }

            final TiActivitySupport activitySupport = (TiActivitySupport) activity;
            activitySupport.launchActivityForResult(installTTSIntent, INSTALL_INTENT_ID, this);
        } catch (Exception e) {
            Log.e(UtteranceModule.MODULE_FULL_NAME, "Error installing TTS data: " + e.getMessage());
            fireError(EVENT_INSTALL_COMPLETE, INSTALL_INTENT_ID, e.getMessage());
        }
    }

    // Keep old method for compatibility
    @Kroll.method
    @Deprecated
    public void InstallData() {
        installData();
    }

    private void fireError(String eventName, int requestCode, String message) {
        if (hasListeners(eventName)) {
            HashMap<String, Object> event = new HashMap<String, Object>();
            event.put("success", false);
            event.put("requestCode", requestCode);
            event.put("message", message);
            fireEvent(eventName, event);
        }
    }

    @Override
    public void listenerAdded(String arg0, int arg1, KrollProxy arg2) {
    }

    @Override
    public void listenerRemoved(String arg0, int arg1, KrollProxy arg2) {
    }

    @Override
    public void processProperties(KrollDict arg0) {
    }

    @Override
    public void propertiesChanged(List<KrollPropertyChange> arg0, KrollProxy arg1) {
    }

    @Override
    public void propertyChanged(String arg0, Object arg1, Object arg2, KrollProxy arg3) {
    }

    @Override
    public void onError(Activity activity, int requestCode, Exception error) {
        Log.d(UtteranceModule.MODULE_FULL_NAME, "onError : Errored");
        if (requestCode == CHECK_INSTALL_INTENT_ID) {
            fireError(EVENT_INSTALL_CHECK, requestCode, error.getMessage());
        } else if (requestCode == INSTALL_INTENT_ID) {
            fireError(EVENT_INSTALL_COMPLETE, requestCode, error.getMessage());
        }
    }

    @Override
    public void onResult(Activity activity, int requestCode, int resultCode, Intent data) {
        Log.d(UtteranceModule.MODULE_FULL_NAME, "onResult : requestCode = " + requestCode);

        try {
            if (requestCode == CHECK_INSTALL_INTENT_ID) {
                if (hasListeners(EVENT_INSTALL_CHECK)) {
                    boolean isInstalled = (resultCode == TextToSpeech.Engine.CHECK_VOICE_DATA_PASS);
                    String msg = isInstalled ? "TTS Data Installed" : "TTS Data Not installed";

                    HashMap<String, Object> event = new HashMap<String, Object>();
                    event.put("success", isInstalled);
                    event.put("installed", isInstalled);
                    event.put("requestCode", requestCode);
                    event.put("message", msg);

                    // If additional data is available
                    if (data != null && !isInstalled) {
                        // Get missing voices if available
                        ArrayList<String> missingVoices = data.getStringArrayListExtra(
                            TextToSpeech.Engine.EXTRA_UNAVAILABLE_VOICES);
                        if (missingVoices != null && missingVoices.size() > 0) {
                            event.put("missingVoices", missingVoices.toArray());
                        }
                    }

                    fireEvent(EVENT_INSTALL_CHECK, event);
                }
            } else if (requestCode == INSTALL_INTENT_ID) {
                if (hasListeners(EVENT_INSTALL_COMPLETE)) {
                    HashMap<String, Object> event = new HashMap<String, Object>();
                    event.put("success", true);
                    event.put("requestCode", requestCode);
                    event.put("message", "Install intent completed");
                    fireEvent(EVENT_INSTALL_COMPLETE, event);
                }
            }
        } catch (Exception error) {
            Log.e(UtteranceModule.MODULE_FULL_NAME, error.getMessage());
            error.printStackTrace();

            String eventName = (requestCode == CHECK_INSTALL_INTENT_ID) ?
                EVENT_INSTALL_CHECK : EVENT_INSTALL_COMPLETE;
            fireError(eventName, requestCode, error.getMessage());
        }
    }
}
