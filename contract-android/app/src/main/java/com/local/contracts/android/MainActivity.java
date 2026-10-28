package com.local.contracts.android;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.*;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.File;

public final class MainActivity extends Activity {
 static final String ORIGIN="https://appassets.androidplatform.net";
 WebView web;
 StateStore store;
 @Override public void onCreate(Bundle savedInstanceState){
  super.onCreate(savedInstanceState);
  try{store=StateStore.forApp(this);}catch(Exception error){TextView message=new TextView(this);message.setPadding(32,64,32,32);message.setText("Не удалось открыть локальный черновик. Проверьте свободное место и перезапустите приложение. Данные не очищены.");setContentView(message);return;}
  getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
  LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(0xfff1f5f9);
  if(android.os.Build.VERSION.SDK_INT>=30){
   getWindow().setDecorFitsSystemWindows(false);
   root.setOnApplyWindowInsetsListener((view,insets)->{android.graphics.Insets padding=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.ime());view.setPadding(padding.left,padding.top,padding.right,padding.bottom);return insets;});
  }else root.setFitsSystemWindows(true);
  web=new WebView(this);web.setId(R.id.web_view);web.setImportantForAutofill(WebView.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
  root.addView(web,new LinearLayout.LayoutParams(-1,-1));setContentView(root);
  WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(false);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setBlockNetworkLoads(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setSaveFormData(false);settings.setJavaScriptCanOpenWindowsAutomatically(false);settings.setSupportMultipleWindows(false);
  WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
  WebViewAssetLoader loader=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
  web.setWebViewClient(new WebViewClient(){
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
    Uri uri=request.getUrl();if("https".equals(uri.getScheme())&&"appassets.androidplatform.net".equals(uri.getHost())){WebResourceResponse response=loader.shouldInterceptRequest(uri);if(response!=null)return response;}
    return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",java.util.Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
   }
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !request.getUrl().toString().equals(ORIGIN+"/assets/index.html");}
  });
  web.addJavascriptInterface(new Bridge(),"Android");
  web.loadUrl(ORIGIN+"/assets/index.html");
 }
 Intent shareIntent(String id) throws Exception {
  File file=store.document(id);Uri uri=FileProvider.getUriForFile(this,BuildConfig.APPLICATION_ID+".files",file);
  Intent intent=new Intent(Intent.ACTION_SEND);intent.setType("application/vnd.openxmlformats-officedocument.wordprocessingml.document");intent.putExtra(Intent.EXTRA_STREAM,uri);intent.setClipData(ClipData.newRawUri(file.getName(),uri));intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);return intent;
 }
 final class Bridge {
  @JavascriptInterface public String getState(){return store.getState();}
  @JavascriptInterface public String saveDraft(String json){try{store.saveDraft(json);return "{\"ok\":true}";}catch(Exception error){return failure("Не удалось сохранить черновик на телефоне.");}}
  @JavascriptInterface public String newDraft(){try{return store.newDraft();}catch(Exception error){return failure("Не удалось полностью очистить предыдущий договор. Проверьте свободное место.");}}
  @JavascriptInterface public String saveDocument(String base64,String name,String kind){try{return store.saveDocument(base64,name,kind);}catch(Exception error){return failure("Не удалось сохранить Word-документ на телефоне. Проверьте свободное место.");}}
  @JavascriptInterface public String shareDocument(String id){
   try{Intent intent=shareIntent(id);runOnUiThread(()->{try{startActivity(Intent.createChooser(intent,"Переслать Word-документ"));}catch(Exception error){web.evaluateJavascript("window.onNativeError('Не удалось открыть системное меню Переслать.')",null);}});return "{\"ok\":true}";}
   catch(Exception error){return failure("Документ недоступен. Создайте его заново.");}
  }
 }
 private String failure(String message){try{return new JSONObject().put("error",message).toString();}catch(Exception ignored){return "{\"error\":\"Ошибка\"}";}}
 @Override public void onBackPressed(){if(web==null){super.onBackPressed();return;}web.evaluateJavascript("window.androidBack ? window.androidBack() : false",result->{if(!"true".equals(result))finish();});}
 @Override protected void onDestroy(){if(web!=null){web.removeJavascriptInterface("Android");web.destroy();}super.onDestroy();}
}
