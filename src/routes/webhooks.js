import express from 'express';
import stripe from '../config/stripe.js';
import supabase from '../config/supabase.js';

const router = express.Router();

// ─── POST /webhooks/stripe ────────────────────────────────────────────────────
// IMPORTANTE: Esta rota precisa receber o body RAW (não parseado como JSON)
// por isso o express.raw() está configurado no server.js para este path
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  // Valida a assinatura do webhook
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[WEBHOOK] Assinatura inválida:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  console.log(`[WEBHOOK] Evento recebido: ${event.type}`);

  try {
    switch (event.type) {

      // ── Assinatura criada ou atualizada ──────────────────────────────────
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.user_id;

        if (!userId) break;

        const isActive = subscription.status === 'active' || subscription.status === 'trialing';
        const plan = subscription.metadata?.plan?.includes('annual') ? 'pro' : 'pro';

        await supabase.from('users').update({
          plan: isActive ? 'pro' : 'free',
          subscription_status: subscription.status,
          stripe_subscription_id: subscription.id,
          subscription_end_date: new Date(subscription.current_period_end * 1000).toISOString(),
        }).eq('id', userId);

        console.log(`[WEBHOOK] Assinatura ${subscription.status} para user ${userId}`);
        break;
      }

      // ── Assinatura cancelada ──────────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.user_id;

        if (!userId) break;

        await supabase.from('users').update({
          plan: 'free',
          subscription_status: 'canceled',
          stripe_subscription_id: null,
          subscription_end_date: null,
        }).eq('id', userId);

        console.log(`[WEBHOOK] Assinatura cancelada para user ${userId}`);
        break;
      }

      // ── Pagamento de fatura bem-sucedido (renovação mensal/anual) ─────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;

        if (!subscriptionId) break;

        // Busca a subscription para pegar o user_id
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const userId = subscription.metadata?.user_id;

        if (!userId) break;

        // Registra o pagamento no histórico
        await supabase.from('payments').insert({
          user_id: userId,
          stripe_payment_intent_id: invoice.payment_intent,
          amount: invoice.amount_paid,
          currency: invoice.currency,
          payment_method: 'card',
          status: 'paid',
          plan: subscription.metadata?.plan || 'pro_monthly',
        });

        // Garante que o plano está ativo
        await supabase.from('users').update({
          plan: 'pro',
          subscription_status: 'active',
          subscription_end_date: new Date(subscription.current_period_end * 1000).toISOString(),
        }).eq('id', userId);

        break;
      }

      // ── Pagamento de fatura falhou ────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;

        if (!subscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const userId = subscription.metadata?.user_id;

        if (!userId) break;

        await supabase.from('users').update({
          subscription_status: 'past_due',
        }).eq('id', userId);

        // Aqui você pode disparar um email de cobrança falhou
        console.log(`[WEBHOOK] Pagamento falhou para user ${userId}`);
        break;
      }

      // ── Checkout concluído (PIX pagamento único ou cartão) ────────────────
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        const plan = session.metadata?.plan;

        if (!userId) break;

        // PIX: modo 'payment' (único). Cartão: modo 'subscription' (tratado acima)
        if (session.mode === 'payment' && session.payment_status === 'paid') {
          // Plano anual via PIX — ativa por 1 ano
          const endDate = new Date();
          endDate.setFullYear(endDate.getFullYear() + 1);

          await supabase.from('users').update({
            plan: 'pro',
            subscription_status: 'active',
            subscription_end_date: endDate.toISOString(),
          }).eq('id', userId);

          // Registra pagamento
          await supabase.from('payments').insert({
            user_id: userId,
            stripe_session_id: session.id,
            stripe_payment_intent_id: session.payment_intent,
            amount: session.amount_total,
            currency: session.currency,
            payment_method: 'pix',
            status: 'paid',
            plan: 'pro_annual',
          });

          console.log(`[WEBHOOK] PIX pago com sucesso para user ${userId}`);
        }
        break;
      }

      // ── PIX expirou sem pagamento ─────────────────────────────────────────
      case 'checkout.session.expired': {
        const session = event.data.object;
        console.log(`[WEBHOOK] Sessão expirada: ${session.id}`);
        break;
      }

      default:
        console.log(`[WEBHOOK] Evento não tratado: ${event.type}`);
    }
  } catch (err) {
    console.error('[WEBHOOK] Erro ao processar evento:', err);
    // Retorna 200 mesmo assim para o Stripe não retentar indefinidamente
  }

  return res.json({ received: true });
});

export default router;
