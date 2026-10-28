$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
if(-not $env:JAVA_HOME){$env:JAVA_HOME='D:\Android Studio\jbr'}
$keytool=Join-Path $env:JAVA_HOME 'bin\keytool.exe'
if(-not(Test-Path -LiteralPath $keytool)){throw 'Set JAVA_HOME first.'}
$private=Join-Path $projectRoot '.signing'
$keystore=Join-Path $private 'contracts.p12'
$properties=Join-Path $projectRoot 'signing.properties'
if((Test-Path -LiteralPath $keystore) -or (Test-Path -LiteralPath $properties)){throw 'Signing files already exist. They are preserved; do not replace the key used by an installed app.'}
New-Item -ItemType Directory -Force $private | Out-Null
$bytes=New-Object byte[] 32
$rng=[Security.Cryptography.RandomNumberGenerator]::Create();$rng.GetBytes($bytes);$rng.Dispose()
$password=[BitConverter]::ToString($bytes).Replace('-','').ToLowerInvariant()
$passwordFile=Join-Path $private 'password.txt'
[IO.File]::WriteAllText($passwordFile,$password,[Text.Encoding]::ASCII)
& $keytool -genkeypair -keystore $keystore -storetype PKCS12 -storepass:file $passwordFile -keypass:file $passwordFile -alias local-contracts -keyalg RSA -keysize 3072 -validity 36500 -dname 'CN=Local Contracts Android'
if($LASTEXITCODE -ne 0){throw 'Key generation failed'}
[IO.File]::WriteAllText($properties,"storeFile=.signing/contracts.p12`nstorePassword=$password`nkeyAlias=local-contracts`nkeyPassword=$password`n",[Text.Encoding]::ASCII)
Write-Output 'Private signing files created locally. Keep them to sign updates. They must not be committed to Git.'
