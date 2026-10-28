package com.local.contracts.android;

import android.content.Context;
import android.util.AtomicFile;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** Only one client and at most one file per document type. No external storage or backup. */
final class StateStore {
 private static StateStore instance;
 static synchronized StateStore forApp(Context context) throws Exception {if(instance==null)instance=new StateStore(context);return instance;}
 private final Context context;
 private final AtomicFile storage;
 private final File documentRoot;
 private JSONObject state;
 StateStore(Context context) throws Exception {
  this.context=context.getApplicationContext();
  storage=new AtomicFile(new File(context.getNoBackupFilesDir(),"draft.json"));
  documentRoot=new File(context.getFilesDir(),"generated");
  if(!documentRoot.exists()&&!documentRoot.mkdirs())throw new IOException("Storage unavailable");
  if(storage.getBaseFile().exists()){
   try(InputStream in=storage.openRead();ByteArrayOutputStream bytes=new ByteArrayOutputStream()){byte[] block=new byte[8192];int count;while((count=in.read(block))!=-1)bytes.write(block,0,count);state=new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));}
  }else{state=new JSONObject().put("draft",new JSONObject()).put("documents",new JSONArray());}
  if(!state.has("draft")||!state.has("documents"))throw new IOException("Invalid draft");
  removeOrphans();
 }
 synchronized String getState(){return state.toString();}
 synchronized void saveDraft(String json) throws Exception {
  if(json==null||json.length()>131072)throw new IllegalArgumentException("Draft too large");
  JSONObject draft=new JSONObject(json);
  for(java.util.Iterator<String> keys=draft.keys();keys.hasNext();){String key=keys.next();if(!(draft.get(key) instanceof String))throw new IllegalArgumentException("Invalid field");}
  JSONObject next=cloneState();next.put("draft",draft);commit(next);
 }
 synchronized String newDraft() throws Exception {
  JSONObject draft=new JSONObject();String phone=state.getJSONObject("draft").optString("managerPhone","");if(!phone.isEmpty())draft.put("managerPhone",phone);
  JSONObject next=new JSONObject().put("draft",draft).put("documents",new JSONArray());
  commit(next);removeOrphans();return state.toString();
 }
 synchronized String saveDocument(String encoded,String name,String kind) throws Exception {
  if(!kind.equals("contract")&&!kind.equals("consent"))throw new IllegalArgumentException("Invalid kind");
  if(encoded==null||encoded.length()>4*1024*1024)throw new IllegalArgumentException("Document too large");
  if(name==null||!name.endsWith(".docx")||name.length()>200||name.matches(".*[<>:\"/\\\\|?*\\p{Cntrl}].*"))throw new IllegalArgumentException("Invalid filename");
  byte[] bytes=Base64.decode(encoded,Base64.DEFAULT);
  if(bytes.length<4||bytes[0]!='P'||bytes[1]!='K')throw new IllegalArgumentException("Not DOCX");
  String id=UUID.randomUUID().toString();File dir=new File(documentRoot,id);if(!dir.mkdir())throw new IOException("Cannot create document folder");
  File output=new File(dir,name);
  try(FileOutputStream stream=new FileOutputStream(output)){stream.write(bytes);stream.getFD().sync();}
  JSONObject item=new JSONObject().put("id",id).put("name",name).put("kind",kind);
  JSONObject next=cloneState();JSONArray documents=new JSONArray();JSONArray previous=state.getJSONArray("documents");
  for(int i=0;i<previous.length();i++)if(!previous.getJSONObject(i).getString("kind").equals(kind))documents.put(previous.getJSONObject(i));
  documents.put(item);next.put("documents",documents);
  try{commit(next);}catch(Exception error){deleteTree(dir);throw error;}
  removeOrphans();return item.toString();
 }
 synchronized File document(String id) throws Exception {
  JSONArray documents=state.getJSONArray("documents");
  for(int i=0;i<documents.length();i++){
   JSONObject item=documents.getJSONObject(i);if(item.getString("id").equals(id)){
    File file=new File(new File(documentRoot,id),item.getString("name"));
    if(!file.getCanonicalPath().startsWith(documentRoot.getCanonicalPath()+File.separator)||!file.isFile())throw new IOException("Missing document");
    return file;
   }
  }
  throw new FileNotFoundException("Unknown document");
 }
 private JSONObject cloneState() throws Exception{return new JSONObject(state.toString());}
 private void commit(JSONObject next) throws Exception {
  FileOutputStream stream=null;
  try{stream=storage.startWrite();stream.write(next.toString().getBytes(StandardCharsets.UTF_8));storage.finishWrite(stream);state=next;}
  catch(Exception error){if(stream!=null)storage.failWrite(stream);throw error;}
 }
 private void removeOrphans() throws Exception {
  java.util.Set<String> keep=new java.util.HashSet<>();JSONArray documents=state.getJSONArray("documents");
  for(int i=0;i<documents.length();i++)keep.add(documents.getJSONObject(i).getString("id"));
  File[] directories=documentRoot.listFiles();if(directories==null)throw new IOException("Cannot list documents");
  for(File dir:directories)if(!keep.contains(dir.getName()))deleteTree(dir);
 }
 private void deleteTree(File file) throws Exception {
  if(!file.getCanonicalPath().startsWith(documentRoot.getCanonicalPath()+File.separator))throw new IOException("Invalid document path");
  if(file.isDirectory()){File[] children=file.listFiles();if(children==null)throw new IOException("Cannot clean documents");for(File child:children)deleteTree(child);}
  if(!file.delete()&&file.exists())throw new IOException("Cannot clean document");
 }
}

