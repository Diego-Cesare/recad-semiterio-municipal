# Formulario PDF App

Webapp simples com:
- Formulario com Nome, CPF, Telefone, Nome de familiar e Email
- Upload de ate 6 imagens
- Geracao de PDF com os dados e imagens
- Envio do PDF por e-mail para um destinatario fixo

## Como funciona o remetente
O app envia e-mail via API da Resend.
O e-mail informado pelo usuario no formulario e usado como `reply-to`.

## Requisitos
- Node.js 18+
- Conta na Resend com API Key

## Configuracao local
1. Instale dependencias:

```bash
npm install
```

2. Copie `.env.example` para `.env` e preencha os valores:

```bash
cp .env.example .env
```

3. Rode em dev:

```bash
npm run dev
```

Acesse `http://localhost:3000`.

## Deploy na Render
1. Suba este projeto para um repositorio Git.
2. Na Render, crie um novo `Blueprint` apontando para o repo (usa `render.yaml`).
3. O `render.yaml` ja aplica automaticamente:
- `RESEND_FROM`
- `TARGET_EMAIL`
4. No painel da Render, em `Environment`, preencha manualmente apenas:
- `RESEND_API_KEY`

## Rotas principais
- `GET /` pagina do app
- `POST /api/send-pdf` envia formulario + anexo PDF para e-mail destino
- `GET /health` health check

## Seguranca
- Nunca commitar `.env`
- Em producao, mantenha `RESEND_API_KEY` apenas na Render
