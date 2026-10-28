package com.local.contracts.android;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.app.Instrumentation;
import android.net.Uri;
import android.os.Build;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@RunWith(AndroidJUnit4.class)
public class OfflineFlowTest {
 private String read(InputStream input) throws Exception {try(InputStream in=input;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] bytes=new byte[8192];int n;while((n=in.read(bytes))!=-1)out.write(bytes,0,n);return out.toString("UTF-8");}}
 private String evaluate(ActivityScenario<MainActivity> scenario,String expression) throws Exception {
  CountDownLatch ready=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();
  scenario.onActivity(activity->activity.web.evaluateJavascript(expression,value->{result.set(value);ready.countDown();}));
  assertTrue("JavaScript callback",ready.await(15,TimeUnit.SECONDS));return result.get();
 }
 private void waitFor(ActivityScenario<MainActivity> scenario,String condition) throws Exception {
  long until=System.currentTimeMillis()+45000;String last="";while(System.currentTimeMillis()<until){last=evaluate(scenario,condition);if("true".equals(last))return;Thread.sleep(150);}fail("Condition timeout: "+condition+"; result="+last);
 }
 private String xml(File file) throws Exception {try(ZipInputStream in=new ZipInputStream(new FileInputStream(file))){ZipEntry entry;while((entry=in.getNextEntry())!=null){if(entry.getName().equals("word/document.xml")){ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] bytes=new byte[8192];int n;while((n=in.read(bytes))!=-1)out.write(bytes,0,n);return out.toString("UTF-8");}}}throw new IOException("Missing Word document XML");}
 private void copyForHost(File file,String kind) throws Exception {
  File qa=new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getNoBackupFilesDir(),"qa");if(!qa.exists()&&!qa.mkdirs())throw new IOException("Cannot create QA output directory");File outFile=new File(qa,"verified-"+kind+".docx");
  try(InputStream in=new FileInputStream(file);OutputStream out=new FileOutputStream(outFile)){byte[] bytes=new byte[8192];int n;while((n=in.read(bytes))!=-1)out.write(bytes,0,n);}
 }
 @Test public void offlineDocumentsSharingPersistenceAndNewClient() throws Exception {
  assertTrue("Emulator only",Build.FINGERPRINT.contains("generic")||Build.MODEL.contains("sdk"));
  Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();Context context=instrumentation.getTargetContext();
  assertEquals(android.content.pm.PackageManager.PERMISSION_DENIED,context.checkSelfPermission(Manifest.permission.INTERNET));
  assertEquals(0,context.getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_ALLOW_BACKUP);
  String fixture=read(instrumentation.getContext().getAssets().open("long-fixture.json"));JSONObject data=new JSONObject(fixture);
  StateStore store=new StateStore(context);store.newDraft();store.saveDraft(fixture);
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
   waitFor(scenario,"!!window.ContractDocuments && !!document.getElementById('consent') && document.getElementById('heading').textContent==='Договор'");
   assertEquals("true",evaluate(scenario,"document.querySelector('[name=managerPhone]').value=== "+JSONObject.quote(data.getString("managerPhone"))));
   evaluate(scenario,"document.querySelectorAll('#steps button')[3].click()");
   evaluate(scenario,"(()=>{const input=document.querySelector('[name=payment]');input.value='1950000';input.dispatchEvent(new Event('input',{bubbles:true}));return input.value})()");
   assertEquals(JSONObject.quote("1.950.000 р."),evaluate(scenario,"document.querySelector('[name=payment]').value"));
   evaluate(scenario,"document.querySelectorAll('#steps button')[4].click();document.getElementById('contract').click()");
   waitFor(scenario,"JSON.parse(Android.getState()).documents.length===1 && !document.getElementById('contract').disabled");
   evaluate(scenario,"document.getElementById('consent').click()");
   waitFor(scenario,"JSON.parse(Android.getState()).documents.length===2 && !document.getElementById('consent').disabled");
   StateStore saved=new StateStore(context);JSONArray documents=new JSONObject(saved.getState()).getJSONArray("documents");assertEquals(2,documents.length());
   File[] originals=new File[2];
   for(int i=0;i<documents.length();i++){
    JSONObject item=documents.getJSONObject(i);File file=saved.document(item.getString("id"));originals[i]=file;String text=xml(file).replaceAll("<[^>]*>","");
    assertTrue(text.contains(data.getString("fullName")));assertTrue(text.contains(data.getString("address")));
    if(item.getString("kind").equals("consent")){assertEquals(1,text.split(java.util.regex.Pattern.quote(data.getString("fullName")),-1).length-1);assertFalse(text.contains("2026"));assertTrue(text.contains("________ г."));}
    copyForHost(file,item.getString("kind"));
   }
   assertEquals("true",evaluate(scenario,"[...document.querySelectorAll('[data-share]')].every(button=>button.textContent==='Переслать')"));
   evaluate(scenario,"document.getElementById('documents').scrollIntoView({block:'start'})");Thread.sleep(800);
   android.graphics.Bitmap screenshot=instrumentation.getUiAutomation().takeScreenshot();
   if(screenshot!=null){File qa=new File(context.getNoBackupFilesDir(),"qa");try(OutputStream output=new FileOutputStream(new File(qa,"review.png"))){screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG,100,output);}screenshot.recycle();}
   String firstId=documents.getJSONObject(0).getString("id");AtomicReference<Intent> share=new AtomicReference<>();
   scenario.onActivity(activity->{try{share.set(activity.shareIntent(firstId));}catch(Exception error){throw new RuntimeException(error);}});
   assertEquals(Intent.ACTION_SEND,share.get().getAction());assertEquals("application/vnd.openxmlformats-officedocument.wordprocessingml.document",share.get().getType());
   Uri uri=share.get().getParcelableExtra(Intent.EXTRA_STREAM);assertNotNull(uri);assertEquals("content",uri.getScheme());assertEquals(uri,share.get().getClipData().getItemAt(0).getUri());assertTrue((share.get().getFlags()&Intent.FLAG_GRANT_READ_URI_PERMISSION)!=0);
   try(InputStream in=context.getContentResolver().openInputStream(uri)){assertEquals('P',in.read());assertEquals('K',in.read());}
   Instrumentation.ActivityMonitor chooser=instrumentation.addMonitor(new IntentFilter(Intent.ACTION_CHOOSER),null,true);
   evaluate(scenario,"document.querySelector('[data-share]').click()");
   long deadline=System.currentTimeMillis()+10000;while(chooser.getHits()==0&&System.currentTimeMillis()<deadline)Thread.sleep(100);
   assertTrue("Переслать opens the Android chooser",chooser.getHits()>0);instrumentation.removeMonitor(chooser);
   scenario.recreate();waitFor(scenario,"!!window.ContractDocuments && document.getElementById('heading').textContent==='Договор'");
   assertEquals("true",evaluate(scenario,"JSON.parse(Android.getState()).documents.length===2"));
   evaluate(scenario,"document.getElementById('new').click();document.getElementById('reset-confirm').click()");
   waitFor(scenario,"JSON.parse(Android.getState()).documents.length===0");
   JSONObject cleared=new JSONObject(new StateStore(context).getState()).getJSONObject("draft");assertEquals(data.getString("managerPhone"),cleared.getString("managerPhone"));assertFalse(cleared.has("fullName"));assertFalse(cleared.has("passportNumber"));
   for(File file:originals)assertFalse("Previous client document removed",file.exists());
   assertFalse("Draft not stored in a backup directory",new File(context.getFilesDir(),"draft.json").exists());assertTrue(new File(context.getNoBackupFilesDir(),"draft.json").isFile());
  }
 }
}

