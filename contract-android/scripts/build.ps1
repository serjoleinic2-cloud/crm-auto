param([switch]$Debug)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
if(-not $env:JAVA_HOME){$env:JAVA_HOME='D:\Android Studio\jbr'}
if(-not(Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\java.exe'))){throw 'Set JAVA_HOME to JDK 17 or newer.'}
$env:Path="$env:JAVA_HOME\bin;$env:Path"
$env:GRADLE_USER_HOME=Join-Path $projectRoot '.gradle-home'
Push-Location $projectRoot
try {
 if(-not(Test-Path local.properties)){
  $sdk=$env:ANDROID_HOME;if(-not $sdk){$sdk='C:\Android\Sdk'}
  if(-not(Test-Path -LiteralPath (Join-Path $sdk 'platforms\android-35\android.jar'))){throw 'Android SDK Platform 35 is required.'}
  ('sdk.dir='+$sdk.Replace('\','/').Replace(':','\:')) | Set-Content local.properties -Encoding ascii
 }
 if(-not(Test-Path node_modules)){& npm.cmd ci;if($LASTEXITCODE -ne 0){throw 'npm ci failed'}}
 & npm.cmd run build;if($LASTEXITCODE -ne 0){throw 'Asset build failed'}
 & npm.cmd test;if($LASTEXITCODE -ne 0){throw 'Document checks failed'}
 if($Debug){$task='assembleDebug';$apk='app\build\outputs\apk\debug\app-debug.apk';$name='Local-Contracts-Android-debug.apk'}
 else {
  if(-not(Test-Path signing.properties)){throw 'Run scripts\create-signing.ps1 once, and keep its private files for future updates.'}
  $task='assembleRelease';$apk='app\build\outputs\apk\release\app-release.apk';$name='Local-Contracts-Android-1.0.0.apk'
 }
 & .\gradlew.bat $task --no-daemon --console plain;if($LASTEXITCODE -ne 0){throw 'Android build failed'}
 New-Item -ItemType Directory -Force release | Out-Null
 Copy-Item -LiteralPath $apk -Destination (Join-Path release $name) -Force
 Copy-Item -LiteralPath $apk -Destination $name -Force
 Write-Output ('APK: '+(Join-Path $projectRoot $name))
} finally {Pop-Location}
