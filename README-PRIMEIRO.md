# MasterSafe 7.0 Native

Esta edição transforma o MasterSafe Web em aplicativo instalado usando **Tauri 2**.
A mesma interface e o mesmo cofre criptografado são reutilizados no Windows e Android.

## O que muda

- Windows: abre em janela própria, com ícone na barra de tarefas e instalador `.exe`.
- Android: gera um `.apk` que pode ser instalado como aplicativo normal.
- O app continua usando seu Supabase atual para login e sincronização.
- A criptografia e o IndexedDB continuam no dispositivo.
- O navegador não precisa ser aberto pelo usuário.

## Windows 11

1. Abra PowerShell na pasta do projeto.
2. Execute `1-INSTALAR-REQUISITOS-WINDOWS.ps1` uma única vez.
3. Reinicie o Windows.
4. Execute `2-GERAR-MASTERSAFE-WINDOWS.ps1`.
5. O instalador será criado em `src-tauri\target\release\bundle\nsis\`.

Para testar sem gerar o instalador, use `3-TESTAR-MASTERSAFE-WINDOWS.ps1`.

## Android

1. Instale gratuitamente o Android Studio.
2. No SDK Manager, instale Android SDK Platform, Platform-Tools, Build-Tools, Command-line Tools e NDK.
3. Configure as variáveis `JAVA_HOME`, `ANDROID_HOME` e `NDK_HOME` conforme o Android Studio/Tauri indicar.
4. Execute `4-PREPARAR-ANDROID.ps1` uma vez.
5. Execute `5-GERAR-MASTERSAFE-ANDROID.ps1`.
6. O build gera APK/AAB; o APK pode ser instalado diretamente no Android.

## Observação sobre iPhone

O código Tauri também pode ter alvo iOS, porém o build exige macOS/Xcode. Distribuição normal pela App Store exige a conta de desenvolvedor da Apple, portanto não entra na meta de distribuição 100% gratuita. Para Android e Windows, todo o fluxo acima usa ferramentas gratuitas.

## Segurança

A Project URL e a Publishable Key do Supabase estão no frontend porque são credenciais públicas de cliente. Nunca coloque `service_role`, secret key ou senha do banco dentro deste projeto.
