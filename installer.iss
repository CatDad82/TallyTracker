; Tally Time Tracker — Inno Setup installer script
; Prerequisites:
;   1. Run PyInstaller first:  build.bat
;   2. Install Inno Setup 6:   https://jrsoftware.org/isdl.php
;   3. Open this file in Inno Setup Compiler and click Build → Compile
;
; Output: dist-installer\TallyTimeTracker_Setup_1.2.8.exe

#define AppName      "Tally Time Tracker"
#define AppVersion   "1.2.8"
#define AppPublisher "Ian Read"
#define AppURL       "https://ignitevisibility.com"
#define AppExeName   "TallyTimeTracker.exe"
#define SourceDir    "dist\TallyTimeTracker"

[Setup]
AppId={{B4E2F7A1-3C9D-4E5B-8F2A-1D6C0E3B7A92}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
AllowNoIcons=yes
LicenseFile=
OutputDir=dist-installer
OutputBaseFilename=TallyTimeTracker_Setup_{#AppVersion}
SetupIconFile=tt_badge.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#AppExeName}
; Per-user install: no admin prompt, and consistent with the HKCU Run key below.
; Installs to %LocalAppData%\Programs via {autopf}. User can still elevate via the dialog.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
MinVersion=10.0.17763

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon";    Description: "{cm:CreateDesktopIcon}";    GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startupentry";   Description: "Launch Tally on Windows startup"; GroupDescription: "Startup:"; Flags: unchecked

[Files]
; Main app bundle from PyInstaller
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Browser extension (copied alongside so the user can load it in Chrome)
Source: "browser_extension\*"; DestDir: "{app}\browser_extension"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}";          Filename: "{app}\{#AppExeName}"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}";   Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Registry]
; Optional startup entry
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
  ValueType: string; ValueName: "{#AppName}"; \
  ValueData: """{app}\{#AppExeName}"""; \
  Flags: uninsdeletevalue; Tasks: startupentry

[Run]
Filename: "{app}\{#AppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(AppName, '&', '&&')}}"; \
  Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "taskkill"; Parameters: "/F /IM {#AppExeName}"; Flags: runhidden; RunOnceId: "KillTally"

[Code]
procedure InitializeWizard;
begin
  WizardForm.WelcomeLabel2.Caption :=
    'This will install ' + '{#AppName}' + ' version ' + '{#AppVersion}' + ' on your computer.' + #13#10 + #13#10 +
    'After installation, a Chrome extension is included in the installation folder.' + #13#10 +
    'To enable Monday.com integration, load the browser_extension folder as an unpacked extension in Chrome.';
end;
