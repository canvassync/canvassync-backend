import express from 'express';
import stripe from '../config/stripe.js';
import supabase from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Helper: garante que o usuário tem um stripe_customer_id, criando se necessário
async function getOrCreateStripeCustomer(userId) {
  const { data: user } = await supabase
    .from('users')
    .select('stripe_customer_id, email, name')
    .eq('id', userId)
    .single();

  if (!user) throw new Error('Usuário não encontrado');

  // Se já tem customer no Stripe, retorna
  if (user.stripe_customer_id) return user.stripe_customer_id;

  // Cria o customer no Stripe (pode ter sido omitido no cadastro via Google)
  const customer = await stripe.customers.create({
    email: user.email,
    name:  user.name || '',
    metadata: { user_id: userId, source: 'canvassync' },
  });

  // Salva no banco
  await supabase
    .from('users')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId);

  return customer.id;
}

// ─── POST /payments/checkout ──────────────────────────────────────────────────
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const { plan, paymentMethod = 'card' } = req.body;

    const priceId = plan === 'pro_annual'
      ? process.env.STRIPE_PRICE_PRO_ANNUAL
      : process.env.STRIPE_PRICE_PRO_MONTHLY;

    if (!priceId) {
      return res.status(400).json({ error: 'Plano inválido ou Price ID não configurado no .env' });
    }

    // Garante que o customer existe (inclusive para usuários Google)
    const stripeCustomerId = await getOrCreateStripeCustomer(req.user.id);

    // ── Boleto — pagamento único (mensal ou anual) ──────────────────────────
    if (paymentMethod === 'boleto') {
      const isBoletoAnnual = plan === 'pro_annual';
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: 'payment',
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        line_items: [{
          price_data: {
            currency: 'brl',
            product_data: {
              name: isBoletoAnnual ? 'CanvasSync Pro — Anual' : 'CanvasSync Pro — Mensal',
              description: isBoletoAnnual
                ? "Acesso completo por 12 meses, sem marca d'água"
                : "Acesso completo por 1 mês, sem marca d'água",
            },
            unit_amount: isBoletoAnnual ? 39900 : 3990,
          },
          quantity: 1,
        }],
        payment_intent_data: {
          metadata: {
            user_id: req.user.id,
            plan,
            payment_method: 'boleto',
          },
        },
        success_url: `${process.env.FRONTEND_URL}/sucesso?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${process.env.FRONTEND_URL}/planos`,
        metadata: {
          user_id: req.user.id,
          plan,
        },
        locale: 'pt-BR',
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 23, // 23h (Stripe exige < 24h)
      });

      return res.json({ url: session.url, sessionId: session.id });
    }

    // ── Cartão — assinatura recorrente ───────────────────────────────────────
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: {
          user_id: req.user.id,
          plan,
        },
      },
      success_url: `${process.env.FRONTEND_URL}/sucesso?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.FRONTEND_URL}/planos`,
      metadata: {
        user_id: req.user.id,
        plan,
      },
      locale: 'pt-BR',
      allow_promotion_codes: true,
    });

    return res.json({ url: session.url, sessionId: session.id });

  } catch (err) {
    // Log completo no terminal do servidor para facilitar diagnóstico
    console.error('[CHECKOUT] Erro detalhado:', {
      message: err.message,
      stripeCode: err.code,
      stripeType: err.type,
      raw: err.raw?.message,
    });

    // Mensagem amigável baseada no tipo de erro do Stripe
    let friendlyMessage = 'Erro ao criar sessão de pagamento.';
    if (err.code === 'payment_method_not_available') {
      friendlyMessage = 'Forma de pagamento não habilitada na sua conta Stripe. Ative em: Dashboard → Settings → Payment methods.';
    } else if (err.code === 'resource_missing') {
      friendlyMessage = 'Configuração do Stripe incompleta. Verifique os Price IDs no .env do backend.';
    } else if (err.message) {
      friendlyMessage = err.message;
    }

    return res.status(500).json({ error: friendlyMessage });
  }
});

// ─── POST /payments/portal ────────────────────────────────────────────────────
router.post('/portal', requireAuth, async (req, res) => {
  try {
    const stripeCustomerId = await getOrCreateStripeCustomer(req.user.id);

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/conta`,
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('[PORTAL]', err.message);
    return res.status(500).json({ error: 'Erro ao abrir portal de cobrança' });
  }
});

// ─── GET /payments/status ─────────────────────────────────────────────────────
router.get('/status', requireAuth, async (req, res) => {
  const { data: user } = await supabase
    .from('users')
    .select('plan, subscription_status, subscription_end_date, stripe_subscription_id')
    .eq('id', req.user.id)
    .single();

  return res.json({
    plan:           user.plan,
    status:         user.subscription_status,
    endDate:        user.subscription_end_date,
    subscriptionId: user.stripe_subscription_id,
  });
});

export default router;
