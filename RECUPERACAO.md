# Guia de recuperação — Task Manager 100% funcional

**Repositório:** [github.com/Elton850/Task-Manager](https://github.com/Elton850/Task-Manager)

Use este guia quando clonar o repositório ou precisar deixar o projeto funcionando do zero.

---

## Requisitos

- **Node.js 22.5 ou superior** (obrigatório: o backend usa SQLite nativo do Node)
  - Verifique: `node -v`
  - Download: https://nodejs.org/

---

## Passo a passo

### 1. Instalar dependências

Na raiz do projeto:

```bash
npm install
cd frontend && npm install && cd ..
```

(Ou use: `npm run frontend:install` e depois `npm install` na raiz.)

### 2. Variáveis de ambiente

O arquivo `.env` **não** vai no Git (segurança). Se não existir:

```bash
cp .env.example .env
```

Edite `.env` e confira:

| Variável | Obrigatório | Uso |
|----------|-------------|-----|
| `JWT_SECRET` | Sim | String longa e aleatória (mín. 32 caracteres em produção) |
| `SUPER_ADMIN_KEY` | Sim | Chave para gestão de tenants (troque em produção) |
| `PORT` | Não | Padrão 3000 |
| `SYSTEM_ADMIN_EMAIL` | Sim* | Email do admin do sistema (criado na 1ª execução) |
| `SYSTEM_ADMIN_PASSWORD` | Sim* | Senha (mín. 6 caracteres) |
| `SYSTEM_ADMIN_NOME` | Não | Nome exibido do admin |
| `RESEND_API_KEY` | Não | Só se for usar “Esqueci a senha” por e-mail |
| `EMAIL_FROM` | Não | Remetente dos e-mails (ex.: `onboarding@resend.dev` para testes) |

\* Necessários para criar o usuário que acessa com `?tenant=system` e cadastra empresas.

### 3. Banco de dados

- A pasta `data/` e o arquivo `data/taskmanager.db` **não** vão no Git.
- Na **primeira execução** do backend, o próprio código:
  - Cria a pasta `data/` se não existir
  - Cria o arquivo SQLite e as tabelas
  - Cria o tenant `system` e o usuário **Administrador do sistema** (se `SYSTEM_ADMIN_EMAIL` e `SYSTEM_ADMIN_PASSWORD` estiverem no `.env`)

Nada extra para rodar aqui; só subir o backend.

### 4. (Opcional) Dados de exemplo

Para ter uma empresa “demo” com usuário e tarefas de exemplo:

```bash
npm run seed
```

Isso cria o tenant `demo`, usuário `admin@demo.com` / `123456` e algumas tarefas e listas.

### 5. Subir backend e frontend

**Desenvolvimento (recomendado):**

```bash
npm run dev:all
```

- Backend: http://localhost:3000  
- Frontend: http://localhost:5173  

O frontend usa proxy para `/api` → backend, então não precisa configurar URL da API em dev.

**Ou em dois terminais:**

- Terminal 1: `npm run dev` (backend)
- Terminal 2: `npm run frontend:dev` (frontend)

### 6. Acessar o sistema

- **Admin do sistema (cadastro de empresas):**  
  http://localhost:5173?tenant=system  
  Login: valor de `SYSTEM_ADMIN_EMAIL` e `SYSTEM_ADMIN_PASSWORD` do `.env`.

- **Empresa demo (se rodou o seed):**  
  http://localhost:5173?tenant=demo  
  Login: `admin@demo.com` / `123456`

---

## Produção

1. No `.env`: `NODE_ENV=production`, `JWT_SECRET` com 32+ caracteres e `SUPER_ADMIN_KEY` forte.
2. Build do frontend: `npm run frontend:build`
3. Build do backend: `npm run build`
4. Iniciar: `npm run start` (servidor sobe na `PORT` e serve a SPA de `frontend/dist`).
5. Se o frontend for servido por outro domínio, configure `ALLOWED_ORIGINS` no `.env` (ex.: `https://app.seudominio.com`).

---

## Resumo “zero ao funcionando”

```bash
npm install
cd frontend && npm install && cd ..
cp .env.example .env   # se não tiver .env; edite JWT_SECRET, SUPER_ADMIN_KEY, SYSTEM_ADMIN_*
npm run seed           # opcional: dados demo
npm run dev:all
```

Depois acesse http://localhost:5173?tenant=system (admin sistema) ou http://localhost:5173?tenant=demo (se fez seed).
