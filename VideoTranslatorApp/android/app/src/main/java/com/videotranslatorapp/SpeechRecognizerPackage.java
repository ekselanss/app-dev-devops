package com.videotranslatorapp;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public class SpeechRecognizerPackage implements ReactPackage {

    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext context) {
        return Arrays.asList(new SpeechRecognizerModule(context));
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext context) {
        return Collections.emptyList();
    }
}
