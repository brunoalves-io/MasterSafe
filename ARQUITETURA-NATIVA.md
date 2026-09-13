# Arquitetura nativa do MasterSafe

## Um código, duas plataformas

`web/` contém a interface já validada do MasterSafe. O Tauri empacota esses arquivos dentro de um aplicativo nativo.

Windows:
MasterSafe.exe -> WebView2 do Windows -> HTML/CSS/JS local -> Supabase HTTPS

Android:
MasterSafe.apk -> Android WebView -> HTML/CSS/JS local -> Supabase HTTPS

Nenhum Chrome/Brave é aberto. O WebView é um componente interno do sistema operacional.

## Persistência

O cofre local continua usando IndexedDB/Web Crypto. Cada instalação possui armazenamento isolado do aplicativo. A nuvem continua servindo como sincronização criptografada entre dispositivos.

## PWA

O registro do Service Worker foi desativado automaticamente quando o app detecta o runtime Tauri. No site público ele continua funcionando normalmente.
