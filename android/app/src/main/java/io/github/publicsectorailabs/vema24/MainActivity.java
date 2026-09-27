package io.github.publicsectorailabs.vema24;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Vema 1967 - a full-screen window onto the live voyage site.
 * The site itself lives on GitHub Pages, so updating the site updates the TV
 * without reinstalling this app. The screen is kept awake while it runs.
 */
public class MainActivity extends Activity {

    static final String SITE = "https://public-sector-ai-labs.github.io/vema24/";
    static final String START = SITE + "?tv";

    private WebView web;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable retry = new Runnable() {
        @Override public void run() { web.loadUrl(START); }
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(0xFF0F1823);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return false;   // stay inside the app
            }

            // Called for the page itself failing to load (e.g. no internet yet after the TV wakes up)
            @SuppressWarnings("deprecation")
            @Override
            public void onReceivedError(WebView view, int code, String description, String failingUrl) {
                if (failingUrl != null && failingUrl.startsWith(SITE)) showOffline();
            }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl(START);
        web.requestFocus();
        hideSystemBars();
    }

    private void showOffline() {
        String html = "<html><body style='margin:0;height:100vh;display:flex;align-items:center;justify-content:center;"
                + "background:#0f1823;color:#f3ead8;font:32px Georgia,serif;text-align:center'>"
                + "<div>R/V <i>Vema</i> &middot; 1967<br><span style='font-size:20px;color:#b8ab93'>"
                + "Waiting for the internet connection&hellip; trying again in 30 seconds</span></div></body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
        handler.removeCallbacks(retry);
        handler.postDelayed(retry, 30000);
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 19) {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) { hideSystemBars(); web.requestFocus(); }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // Back leaves the app; every other remote button goes to the page
        // (arrows = days, OK = play/pause, up/down = speed, rewind/fast-forward = weeks)
        if (keyCode == KeyEvent.KEYCODE_BACK) { finish(); return true; }
        return super.onKeyDown(keyCode, event);
    }

    @Override protected void onResume() { super.onResume(); web.onResume(); web.resumeTimers(); hideSystemBars(); }
    @Override protected void onPause() { web.onPause(); web.pauseTimers(); super.onPause(); }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override protected void onDestroy() { handler.removeCallbacks(retry); web.destroy(); super.onDestroy(); }
}
