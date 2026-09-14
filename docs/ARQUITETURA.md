# Arquitetura do MasterSafe

## Um código, duas plataformas

A pasta `web/` contém a interface principal do MasterSafe. O Tauri 2 empacota esses arquivos dentro de aplicativos nativos para Windows e Android.

### Windows

`MasterSafe.exe` → WebView2 do Windows → HTML/CSS/JavaScript local → Supabase via HTTPS

### Android

`MasterSafe.apk` → Android WebView → HTML/CSS/JavaScript local → Supabase via HTTPS

O usuário não precisa abrir Chrome, Brave ou outro navegador. O WebView funciona como componente interno do aplicativo.

## Persistência local

O cofre local utiliza IndexedDB e Web Crypto API. Cada instalação mantém seu próprio armazenamento isolado no dispositivo.

Os documentos permanecem disponíveis localmente mesmo quando a nuvem ou os recursos de IA estiverem indisponíveis.

## Sincronização em nuvem

O Supabase é utilizado para autenticação, banco de dados, armazenamento e funções de backend.

Antes da sincronização, os arquivos do cofre são criptografados no dispositivo. A nuvem recebe os arquivos já protegidos.

A quota de armazenamento é dinâmica e ajustada conforme a capacidade disponível no ambiente do beta.

## IA híbrida

O processamento básico de documentos, leitura de PDFs e OCR ocorre localmente sempre que possível.

O recurso **Pergunte ao Cofre** pode usar IA online opcional por meio de uma Supabase Edge Function integrada à Groq.

O arquivo original não é enviado à API de IA. O MasterSafe seleciona apenas trechos relevantes, aplica mascaramento de dados sensíveis e envia somente o conteúdo necessário para responder à pergunta.

A chave da API permanece armazenada como segredo no Supabase e não faz parte do executável nem do APK.

## PWA e Service Worker

O Service Worker é utilizado na versão web para cache e funcionamento offline.

Quando o MasterSafe detecta o runtime Tauri, o aplicativo utiliza seus próprios arquivos locais e não depende de um navegador externo.

## Build e distribuição

O GitHub Actions gera automaticamente:

- `MasterSafe-Windows-Setup.exe` para Windows;
- `MasterSafe-Android.apk` para Android.

Os instaladores são publicados na pre-release **MasterSafe Beta** do GitHub.

## Princípios da arquitetura

- privacidade por padrão;
- criptografia antes da sincronização;
- funcionamento local independente da nuvem;
- serviços online opcionais;
- uma única base de interface para Windows e Android;
- separação entre senha da conta e senha-mestra do cofre;
- ausência de chaves secretas no frontend, EXE ou APK.
