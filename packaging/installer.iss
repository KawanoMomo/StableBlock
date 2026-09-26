; Inno Setup — StableBlock のインストーラ(BLK-human-20260926-2100)
;
;   iscc /DAppVersion=1.1 packaging\installer.iss
;
; PyInstaller が dist\StableBlock\ に出したものをそのまま包む。版は CI がタグから渡す(無ければ止める)。
#define AppName "StableBlock"
#ifndef AppVersion
  #error AppVersion を /DAppVersion=1.1 のように渡す(git tag から取る)
#endif

[Setup]
; 上書き更新にするため AppId は固定(以後変えない。変えると旧版と別物扱いで二重に入る)
AppId=StableBlock
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
VersionInfoVersion={#AppVersion}
VersionInfoProductVersion={#AppVersion}
UninstallDisplayName={#AppName}
AppPublisher=StableBlock
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
UsePreviousAppDir=yes
UsePreviousGroup=yes
DisableDirPage=auto
DisableProgramGroupPage=auto
CloseApplications=yes
RestartApplications=no
UninstallDisplayIcon={app}\{#AppName}.exe
SetupIconFile=icon.ico
LicenseFile=..\LICENSE
OutputDir=..\dist
OutputBaseFilename={#AppName}-{#AppVersion}-setup
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
; 既定は自分だけ(管理者権限なし)。全ユーザー向けはコマンドラインの /ALLUSERS でだけ選べる
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline

[Languages]
Name: "ja"; MessagesFile: "compiler:Languages\Japanese.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[InstallDelete]
; 旧版の _internal を消してから入れる(消えたファイルが残って古い版が混ざらない)
Type: filesandordirs; Name: "{app}\_internal"

[Files]
Source: "..\dist\{#AppName}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppName}.exe"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppName}.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Run]
Filename: "{app}\{#AppName}.exe"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent
