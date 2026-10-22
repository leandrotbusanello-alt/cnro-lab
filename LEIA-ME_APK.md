# App Android (APK) — instalação direta

Entrega de 22/10/2026. O APK é uma **TWA (Trusted Web Activity)**: abre o sistema publicado na
Vercel em tela cheia, como um app. O código é o mesmo do site, então:
- **toda publicação na Vercel atualiza o app sozinha**, sem gerar nem reinstalar APK;
- o modo offline e a câmera funcionam como no navegador.

Só é preciso gerar um APK novo se mudar o **domínio**, o **nome do pacote** ou a **chave de assinatura**.

## O que já está pronto no projeto
- `public/`: ícones gerados a partir do símbolo da Nova Rota, redesenhado em vetor (`favicon.svg`):
  `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (Android, com margem de segurança) e
  `apple-touch-icon.png`.
- Manifesto (`vite.config.js`) com `id`, `scope` e `start_url` fixos. **Não mudar depois de gerar o APK.**
- `public/.well-known/assetlinks.json`: prova ao Android que o app e o site são do mesmo dono
  (sem ela aparece a barra de endereço do Chrome no topo). **Falta a impressão digital (passo 4).**
- O Chrome considera o app instalável: nenhum erro de manifesto, service worker ativo.

## Passo a passo
1. **Publicar** esta versão na Vercel. No Chrome do celular, abrir o endereço `….vercel.app`:
   o menu deve mostrar "Instalar app". Isso confirma que está tudo certo.
2. **Gerar o APK** em https://www.pwabuilder.com:
   - colar o endereço `https://<seu-projeto>.vercel.app` → *Start* → *Package for stores* → **Android**;
   - em *Options*:
     - **Package ID:** `com.novarota.cnrolab` (precisa ser igual ao do `assetlinks.json`);
     - **App name:** `CNRO Lab Control`, **Short name:** `CNRO Lab`;
     - **Signing key:** *Create new*. Preencha nome, organização e senhas e **anote as senhas**;
   - *Download*. Vem um `.zip` com o `.apk`, o `.aab`, a chave (`signing.keystore`) e o
     arquivo `signing-key-info.txt`.
3. **Guardar a chave e as senhas em lugar seguro** (Drive da empresa, cofre de senhas).
   Sem elas não é possível atualizar o app: os celulares recusam um APK assinado com outra chave.
4. **Ligar o app ao site:** o `.zip` traz um `assetlinks.json` pronto, com a impressão digital
   **SHA-256**. Copie o valor `sha256_cert_fingerprints` para `public/.well-known/assetlinks.json`
   (no lugar de `SUBSTITUIR_PELA_IMPRESSAO_DIGITAL_SHA256_DO_PWABUILDER`) e publique de novo.
   Confira em `https://<seu-projeto>.vercel.app/.well-known/assetlinks.json`.
5. **Instalar nos celulares:** envie o `.apk` (WhatsApp, Drive, e-mail). No celular, abra o arquivo
   e permita "Instalar apps desconhecidos" para o app usado (Arquivos, Chrome ou WhatsApp).
   O Google Play Protect pode avisar que o app é desconhecido: toque em "Instalar assim mesmo".
6. **Teste:** abrir o app → não deve aparecer barra de endereço no topo. Se aparecer, o passo 4
   não bateu (impressão digital ou nome do pacote diferentes). Corrija o arquivo e publique de novo.

## Observações
- **Domínio:** o APK fica preso ao endereço `….vercel.app` atual. Se um dia mudar para domínio
  próprio, é preciso gerar outro APK (pode manter a mesma chave e o mesmo nome do pacote).
- **Instalação direta (sem Play Store):** não há atualização do APK pela loja. Como o conteúdo vem
  do site, isso só importa nos casos do início (domínio, pacote ou chave).
- O app exige Chrome atualizado no aparelho, que é o padrão no Android.
