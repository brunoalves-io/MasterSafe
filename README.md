# MasterSafe

Aplicativo para Windows e Android criado para armazenar, organizar, proteger e sincronizar documentos pessoais importantes em um cofre criptografado, com busca inteligente, controle de vencimentos e recursos opcionais de IA.

## Principais recursos

- cofre pessoal com criptografia no dispositivo;
- armazenamento local dos documentos;
- sincronização opcional com Supabase, enviando arquivos já criptografados;
- quota de nuvem elástica, ajustada conforme a capacidade disponível;
- organização por categorias, tags, emissor e datas;
- radar de vencimentos e documentos que exigem atenção;
- leitura de PDFs com PDF.js;
- OCR local de imagens e documentos escaneados com Tesseract.js;
- busca inteligente pelo conteúdo dos próprios documentos;
- **Pergunte ao Cofre** com IA híbrida e uso opcional da Groq por meio de uma Supabase Edge Function;
- mascaramento de dados sensíveis antes do envio de trechos para a IA online;
- autenticação de conta, suporte a 2FA, passkey e código de recuperação;
- backup criptografado e exportação dos dados;
- interface desktop nativa baseada em Tauri;
- aplicativo Android gerado a partir da mesma base;
- funcionamento do cofre local mesmo quando os serviços de nuvem ou IA estiverem indisponíveis.

## Arquivos principais

- `web/index.html` — estrutura principal da interface;
- `web/app.js` — fluxo principal do cofre e gerenciamento dos documentos;
- `web/smart.js` — leitura inteligente, OCR e processamento local;
- `web/cloud.js` — autenticação e sincronização com a nuvem;
- `web/quota.js` — controle da quota dinâmica de armazenamento;
- `web/ai.js` — integração opcional do **Pergunte ao Cofre** com IA online;
- `web/styles.css` — estilos base da aplicação;
- `web/ui-pro.css` e `web/ui-polish.css` — camadas profissionais de UX/UI;
- `src-tauri/` — aplicativo nativo para desktop e Android com Tauri;
- `supabase/` — funções e recursos utilizados no backend Supabase;
- `package.json` — scripts e dependências do projeto;
- `.github/workflows/build-installers.yml` — automação dos builds para Windows e Android.

## Segurança e privacidade

Os documentos são protegidos no dispositivo antes da sincronização com a nuvem. A senha-mestra do cofre é diferente da senha da conta usada para autenticação.

A IA online é opcional. Quando ativada, o MasterSafe seleciona apenas trechos relevantes dos documentos, aplica mascaramento de dados sensíveis e envia esses trechos para a função segura no backend. O arquivo original não é enviado para a API de IA.

A chave da API da Groq fica armazenada como segredo no Supabase e não é incluída no executável do Windows nem no APK Android.

## Build automático para Windows e Android

O repositório possui um workflow do GitHub Actions chamado **Build MasterSafe Installers**.

Ele é executado automaticamente quando alterações chegam à branch `main` e também pode ser iniciado manualmente em **Actions → Build MasterSafe Installers → Run workflow**.

O processo gera dois instaladores:

- `MasterSafe-Windows-Setup.exe` — instalador para Windows;
- `MasterSafe-Android.apk` — aplicativo instalável para Android.

Ao final do build, os arquivos também são publicados automaticamente na pre-release **MasterSafe Beta**, usando a tag `beta-latest`.

## Instalação

### Windows

Baixe `MasterSafe-Windows-Setup.exe` na seção **Releases**, execute o instalador e abra o MasterSafe normalmente pelo Windows.

### Android

Baixe `MasterSafe-Android.apk` na seção **Releases**, permita a instalação do APK no dispositivo e conclua a instalação.

## Tecnologias utilizadas

- Tauri 2;
- Rust;
- JavaScript, HTML e CSS;
- Web Crypto API;
- Supabase Auth, Database, Storage e Edge Functions;
- Groq API para IA online opcional;
- Tesseract.js para OCR;
- PDF.js para leitura de PDFs;
- GitHub Actions para geração automática dos instaladores.

## Estado do projeto

O MasterSafe está atualmente em fase **Beta**. A arquitetura foi projetada para priorizar privacidade, portabilidade e operação com infraestrutura de baixo custo, mantendo o cofre local disponível independentemente dos recursos online.

## Autor

AB Alves
