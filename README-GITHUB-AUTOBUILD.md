# MasterSafe 7.1 — Build automático

Este projeto foi preparado para gerar os instaladores na nuvem, sem instalar Rust, Node, Visual Studio ou Android Studio no seu computador.

## O que o GitHub gera

- `MasterSafe-Windows-Setup.exe` — instalador do Windows.
- `MasterSafe-Android.apk` — APK instalável para testes em Android.

O instalador do Windows usa o modo `offlineInstaller` do Tauri e inclui o instalador do WebView2 caso seja necessário.

## Como disparar

O workflow `.github/workflows/build-installers.yml` roda automaticamente quando o conteúdo chega à branch `main` e também pode ser executado manualmente em **Actions → Build MasterSafe Installers → Run workflow**.

Ao terminar, o workflow também cria/atualiza automaticamente **Releases → MasterSafe Beta**. Nessa página ficam os downloads diretos:

- `MasterSafe-Windows-Setup.exe`
- `MasterSafe-Android.apk`

Os artefatos da execução também continuam disponíveis em **Actions**, caso sejam necessários para diagnóstico.

## Custo zero

Para manter custo zero, use a cota gratuita do GitHub Actions e configure um orçamento de Actions com interrupção do uso ao chegar a R$ 0 / US$ 0 de gasto adicional. Em repositório público, runners padrão são gratuitos, mas isso deixaria o código-fonte público. Para um produto comercial, prefira repositório privado e a cota gratuita.

## Avisos de distribuição

### Windows
O instalador ainda não possui certificado comercial de assinatura de código. O Windows SmartScreen pode mostrar “Editor desconhecido”. Isso não impede a instalação, mas assinatura reconhecida é uma etapa comercial futura e normalmente envolve certificado pago.

### Android
O APK desta automação é um **debug APK**, assinado automaticamente pelo ambiente Android e adequado para instalação/testes diretos. Antes de publicar na Play Store ou distribuir atualizações de produção, crie uma chave de assinatura permanente e guarde-a como GitHub Secret.

## Segurança

Nunca adicione `service_role`, secret keys, senha do banco Supabase ou senhas pessoais ao repositório. A `publishable key` do Supabase usada pelo frontend é pública por definição; a segurança dos dados depende de RLS e da criptografia do MasterSafe.
