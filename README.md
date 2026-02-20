# Task Manager

Sistema de gerenciamento de tarefas com multi-tenant, calendário, desempenho por área e controle de acesso por perfis (USER, LEADER, ADMIN).

---

## Funcionalidades

- **Calendário** — visão por mês e por dia, conclusão de tarefas direto no calendário
- **Tarefas** — listagem, filtros, criação/edição com recorrência, área e tipo; evidências (anexos)
- **Performance** — indicadores e tabela por responsável
- **Usuários** — gestão de usuários por empresa (ADMIN vê todos da empresa; LEADER vê só usuários da sua área)
- **Cadastro de empresas** — um único **administrador do sistema** (tenant `system`) cadastra as empresas; cada empresa tem seu próprio ADMIN, que cadastra Líderes e Usuários vinculados àquela empresa
- **Empresa** — ADMIN de cada empresa pode editar o nome da empresa (dados da empresa)
- **Configurações** — listas de valores (áreas, recorrências, tipos) e regras de recorrência por área (ADMIN/LEADER)
- **Multi-tenant** — isolamento por empresa; ao logar, cada usuário vê somente os dados da sua empresa; Líder vê apenas usuários da sua área
- **Autenticação** — login com JWT, cookies httpOnly, roles e permissões

---

## Stack

| Camada    | Tecnologias |
|-----------|-------------|
| Backend   | Node.js, Express, TypeScript, SQLite (built-in Node) |
| Frontend  | React 18, TypeScript, Vite, TailwindCSS, React Router, Recharts, Lucide |
| Segurança | JWT, Helmet, rate limiting, bcrypt |

---

## Estrutura do projeto

```
task-manager/
├── frontend/           # SPA React (Vite)
│   ├── src/
│   │   ├── components/
│   │   ├── contexts/
│   │   ├── pages/
│   │   ├── services/
│   │   └── types/
│   └── package.json
├── src/                # Backend Express
│   ├── db/             # Schema e seed
│   ├── routes/         # API (auth, tasks, lookups, rules, users, etc.)
│   ├── middleware/
│   └── server.ts
├── data/               # SQLite e uploads (gerados localmente, não versionados)
├── .env.example
├── package.json
└── README.md
```

---

## Requisitos

- **Node.js 18+** (com SQLite nativo)
- npm ou yarn

---

## Instalação e execução

```bash
# 1. Clonar e entrar no projeto
git clone https://github.com/elton850/task-manager-sheets.git task-manager
cd task-manager

# 2. Instalar dependências
npm install
cd frontend && npm install && cd ..

# 3. Variáveis de ambiente
cp .env.example .env
# Editar .env: definir JWT_SECRET e SUPER_ADMIN_KEY (produção)

# 4. (Opcional) Popular banco de exemplo
npm run seed

# 5. Desenvolvimento (backend + frontend)
npm run dev:all
```

- Backend: **http://localhost:3000**
- Frontend: **http://localhost:5173**

Acesso: `http://localhost:5173?tenant=demo` (ou o slug do tenant configurado).

**Administrador do sistema (cadastro de empresas):** acesse com `?tenant=system` e faça login com o usuário criado pelas variáveis `SYSTEM_ADMIN_EMAIL` e `SYSTEM_ADMIN_PASSWORD` (veja abaixo). Esse usuário é o único que vê o menu "Cadastro de empresas" e pode criar novas empresas (cada uma com seu próprio ADMIN).

---

## Variáveis de ambiente

| Variável                 | Descrição                                          | Exemplo                    |
|--------------------------|----------------------------------------------------|----------------------------|
| `PORT`                   | Porta do servidor                                  | `3000`                     |
| `NODE_ENV`               | Ambiente                                           | `development` / `production` |
| `JWT_SECRET`             | Chave para assinatura do JWT                        | string longa e aleatória   |
| `SUPER_ADMIN_KEY`        | Chave para gestão de tenants (API/scripts)          | string secreta             |
| `SYSTEM_ADMIN_EMAIL`     | Email do administrador do sistema (criado na 1ª execução) | `admin@sistema.com` |
| `SYSTEM_ADMIN_PASSWORD`  | Senha do administrador do sistema (mín. 6 caracteres)    | senha segura        |
| `SYSTEM_ADMIN_NOME`      | Nome do administrador do sistema (opcional)        | `Admin Sistema`            |
| `RESEND_API_KEY`         | Chave da API Resend (envio de e-mail do código de reset) | `re_xxxx...` (em [resend.com](https://resend.com/api-keys)) |
| `EMAIL_FROM`             | Remetente dos e-mails (domínio verificado no Resend)     | `Task Manager <noreply@seudominio.com>` ou `onboarding@resend.dev` (testes) |

---

## Scripts principais

| Comando           | Descrição                    |
|-------------------|------------------------------|
| `npm run dev`     | Backend em modo desenvolvimento |
| `npm run dev:all` | Backend + frontend juntos    |
| `npm run build`   | Build do backend (TypeScript)|
| `npm run start`   | Inicia o backend (após build)|
| `npm run seed`    | Popula o banco com dados de exemplo |
| `npm run frontend:dev`   | Só o frontend (Vite)   |
| `npm run frontend:build` | Build da SPA (frontend)|

---

## Licença

Uso interno / proprietário. Ajuste conforme sua política.
