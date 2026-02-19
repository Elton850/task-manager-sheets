# Task Manager

Sistema de gerenciamento de tarefas com multi-tenant, calendário, desempenho por área e controle de acesso por perfis (USER, LEADER, ADMIN).

---

## Funcionalidades

- **Calendário** — visão por mês e por dia, conclusão de tarefas direto no calendário
- **Tarefas** — listagem, filtros, criação/edição com recorrência, área e tipo; evidências (anexos)
- **Performance** — indicadores e tabela por responsável
- **Usuários** — gestão de usuários (ADMIN)
- **Configurações** — listas de valores (áreas, recorrências, tipos) e regras de recorrência por área (ADMIN/LEADER)
- **Multi-tenant** — isolamento por tenant (slug na URL ou subdomínio)
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

---

## Variáveis de ambiente

| Variável         | Descrição                          | Exemplo                    |
|------------------|------------------------------------|----------------------------|
| `PORT`           | Porta do servidor                  | `3000`                     |
| `NODE_ENV`       | Ambiente                           | `development` / `production` |
| `JWT_SECRET`     | Chave para assinatura do JWT        | string longa e aleatória   |
| `SUPER_ADMIN_KEY`| Chave para gestão de tenants       | string secreta            |

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
