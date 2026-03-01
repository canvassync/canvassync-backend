# CanvasSync Backend — Guia Completo de Configuração

## Estrutura do projeto
```
canvassync-backend/
├── src/
│   ├── server.js              ← Entrada principal
│   ├── config/
│   │   ├── supabase.js        ← Cliente do banco de dados
│   │   └── stripe.js          ← Cliente do Stripe
│   ├── middleware/
│   │   └── auth.js            ← Verificação de JWT + Pro
│   └── routes/
│       ├── auth.js            ← Registro, login, /me
│       ├── payments.js        ← Checkout, PIX, Portal
│       └── webhooks.js        ← Eventos automáticos do Stripe
├── frontend-files/
│   └── src/
│       ├── services/api.js    ← Copie para seu projeto React
│       ├── hooks/useAuth.js   ← Copie para seu projeto React
│       └── pages/Checkout.jsx ← Copie para seu projeto React
├── supabase-schema.sql        ← Execute no Supabase
├── .env.example               ← Copie para .env e preencha
└── package.json
```

---

## PASSO 1 — Supabase (banco de dados + auth)

1. Acesse https://supabase.com e crie uma conta gratuita
2. Clique em **New Project** → dê um nome (ex: canvassync)
3. Anote a senha do banco (você vai precisar)
4. Aguarde o projeto inicializar (~2 minutos)
5. No menu lateral: **Settings → API**
6. Copie:
   - **Project URL** → `SUPABASE_URL`
   - **service_role secret** (não o anon!) → `SUPABASE_SERVICE_KEY`

### Criar as tabelas:
1. No Supabase, vá em **SQL Editor → New Query**
2. Copie e cole todo o conteúdo de `supabase-schema.sql`
3. Clique em **Run** (F5)
4. Deve aparecer "Success" sem erros

---

## PASSO 2 — Stripe (pagamentos)

### 2.1 — Criar conta e ativar BRL
1. Acesse https://stripe.com/br e crie uma conta
2. Complete o cadastro do negócio para ativar pagamentos reais
3. No início, use o modo **Test** (chaves começam com `sk_test_`)

### 2.2 — Copiar as chaves de API
1. No dashboard: **Developers → API Keys**
2. Copie **Secret key** → `STRIPE_SECRET_KEY`

### 2.3 — Criar os produtos e preços
1. Vá em **Products → Add product**
2. Crie o produto **"CanvasSync Pro"**
3. Adicione dois preços:
   - **Recorrente · BRL · R$ 29,90 · Mensal** → copie o Price ID → `STRIPE_PRICE_PRO_MONTHLY`
   - **Recorrente · BRL · R$ 299,00 · Anual** → copie o Price ID → `STRIPE_PRICE_PRO_ANNUAL`

### 2.4 — Configurar Webhook (ESSENCIAL)
O webhook é o que avisa o backend quando um pagamento é confirmado.

**Para desenvolvimento local:**
```bash
# Instale o Stripe CLI
# Windows: https://github.com/stripe/stripe-cli/releases
# Mac: brew install stripe/stripe-cli/stripe

stripe login
stripe listen --forward-to localhost:3001/webhooks/stripe
# Vai exibir: "Your webhook signing secret is whsec_..."
# Copie esse valor para STRIPE_WEBHOOK_SECRET
```

**Para produção (deploy):**
1. Dashboard Stripe → **Developers → Webhooks → Add endpoint**
2. URL: `https://seu-backend.railway.app/webhooks/stripe`
3. Eventos a escutar:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `checkout.session.completed`
   - `checkout.session.expired`
4. Copie o **Signing secret** → `STRIPE_WEBHOOK_SECRET`

### 2.5 — Ativar PIX no Stripe
1. Dashboard → **Settings → Payment methods**
2. Procure **Pix** e ative
3. (Pode precisar do negócio verificado para ativar em produção)

---

## PASSO 3 — Configurar o Backend

```bash
# Clone ou navegue até a pasta do backend
cd canvassync-backend

# Instalar dependências
npm install

# Copiar o arquivo de variáveis de ambiente
cp .env.example .env
```

### Abra o `.env` e preencha todos os valores:
```env
PORT=3001
NODE_ENV=development
JWT_SECRET=          # Gere com: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
SUPABASE_URL=        # Do passo 1
SUPABASE_SERVICE_KEY=# Do passo 1
STRIPE_SECRET_KEY=   # Do passo 2
STRIPE_WEBHOOK_SECRET=# Do passo 2.4
STRIPE_PRICE_PRO_MONTHLY=# Do passo 2.3
STRIPE_PRICE_PRO_ANNUAL=# Do passo 2.3
FRONTEND_URL=http://localhost:5173
```

### Iniciar o servidor:
```bash
npm run dev
# Deve aparecer: "CanvasSync API rodando em http://localhost:3001"
```

### Testar se está funcionando:
```bash
curl http://localhost:3001/health
# Resposta esperada: {"status":"ok","service":"CanvasSync API",...}
```

---

## PASSO 4 — Integrar no Frontend React

Copie os arquivos da pasta `frontend-files/` para o seu projeto React:

```bash
# Da pasta raiz do seu projeto React (canvassync-landing-page)
cp -r canvassync-backend/frontend-files/src/services src/
cp -r canvassync-backend/frontend-files/src/hooks src/
cp -r canvassync-backend/frontend-files/src/pages/Checkout.jsx src/pages/
```

### Criar o arquivo `.env` no projeto React:
```env
# canvassync-landing-page/.env
VITE_API_URL=http://localhost:3001
```

### Adicionar AuthProvider no `main.jsx`:
```jsx
import { AuthProvider } from './hooks/useAuth';

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
```

### Usar o hook em qualquer componente:
```jsx
import { useAuth } from './hooks/useAuth';
import { paymentsApi } from './services/api';

function MeuComponente() {
  const { user, isLoggedIn, isPro, logout } = useAuth();

  return (
    <div>
      {isPro ? (
        <p>Você tem acesso Pro! ✅</p>
      ) : (
        <button onClick={() => paymentsApi.checkout('pro_monthly', 'card')}>
          Assinar Pro
        </button>
      )}
    </div>
  );
}
```

---

## PASSO 5 — Proteger o App principal (Canvas)

No seu `App.jsx` atual, adicione verificação de plano:

```jsx
import { useAuth } from './hooks/useAuth';

// No início do componente App:
const { user, isLoggedIn, isPro, loading } = useAuth();

// Antes de renderizar o editor, verifique:
if (loading) return <div>Carregando...</div>;

if (!isLoggedIn) {
  window.location.href = '/entrar';
  return null;
}

// Funções exclusivas Pro (exportar vídeo, sincronia de letra, etc.)
const handleSave = () => {
  if (!isPro && exportFormat.includes('webm')) {
    alert('Exportação de vídeo é exclusiva do plano Pro!');
    window.location.href = '/planos';
    return;
  }
  // ... resto da lógica
};
```

---

## PASSO 6 — Deploy em Produção

### Backend → Railway (recomendado, gratuito para começar)
```bash
# Instale o CLI do Railway
npm install -g @railway/cli

railway login
railway init          # Na pasta canvassync-backend
railway up

# Configure as variáveis de ambiente no dashboard Railway
# (as mesmas do .env, mas com valores de produção e sk_live_ do Stripe)
```

### Frontend → Vercel
```bash
# Instale o CLI do Vercel
npm install -g vercel

vercel                # Na pasta do projeto React
# Adicione VITE_API_URL=https://seu-backend.railway.app no Vercel
```

---

## Rotas da API — Referência Rápida

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/auth/register` | ❌ | Cria conta |
| POST | `/auth/login` | ❌ | Login, retorna JWT |
| GET | `/auth/me` | ✅ | Dados do usuário logado |
| POST | `/payments/checkout` | ✅ | Cria sessão Stripe (cartão ou PIX) |
| POST | `/payments/portal` | ✅ | Abre portal de assinatura Stripe |
| GET | `/payments/status` | ✅ | Status da assinatura |
| POST | `/webhooks/stripe` | 🔐 | Webhook Stripe (assinatura interna) |
| GET | `/health` | ❌ | Health check |

---

## Fluxo de pagamento — Como funciona

```
Usuário clica "Assinar Pro"
        ↓
Frontend chama POST /payments/checkout
        ↓
Backend cria Checkout Session no Stripe
        ↓
Frontend redireciona para stripe.com (checkout seguro)
        ↓
Usuário paga (cartão 7 dias grátis, ou PIX instantâneo)
        ↓
Stripe chama POST /webhooks/stripe
        ↓
Backend atualiza banco: plan='pro', status='active'
        ↓
Usuário é redirecionado para /sucesso
        ↓
Frontend consulta /auth/me → plano atualizado ✅
```

---

## Testando pagamentos (modo Test)

Use os cartões de teste do Stripe:
- **Aprovado:** `4242 4242 4242 4242` — qualquer data futura, qualquer CVV
- **Recusado:** `4000 0000 0000 0002`
- **3D Secure:** `4000 0027 6000 3184`
- **PIX:** No checkout Stripe test, clique em "Simulate PIX payment"
