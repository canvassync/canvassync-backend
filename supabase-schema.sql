-- ═══════════════════════════════════════════════════════════════
-- CanvasSync - Schema do Banco de Dados (Supabase / PostgreSQL)
-- Execute no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════════════

-- 1. Tabela de usuários
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  plan TEXT NOT NULL DEFAULT 'free',          -- 'free' | 'pro'
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT DEFAULT 'inactive', -- 'active' | 'inactive' | 'canceled' | 'past_due'
  subscription_end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela de pagamentos / histórico
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  stripe_payment_intent_id TEXT,
  stripe_session_id TEXT,
  amount INTEGER NOT NULL,                    -- em centavos
  currency TEXT DEFAULT 'brl',
  payment_method TEXT,                        -- 'card' | 'pix'
  status TEXT NOT NULL,                       -- 'pending' | 'paid' | 'failed' | 'refunded'
  plan TEXT,                                  -- 'pro_monthly' | 'pro_annual'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Índices para performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_intent ON payments(stripe_payment_intent_id);

-- 4. Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. RLS (Row Level Security) - IMPORTANTE para segurança
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- O backend usa a service key (bypass RLS), usuários não acessam direto
-- Policies para o service role (acesso total via backend)
CREATE POLICY "service_role_users" ON users
  FOR ALL USING (true);

CREATE POLICY "service_role_payments" ON payments
  FOR ALL USING (true);
