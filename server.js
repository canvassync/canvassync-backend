require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

app.use(cors());

// Rota de Webhook (DEVE vir antes do express.json())
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        
        // Aqui atualizamos o usuário no Supabase
        const { error } = await supabase
            .from('profiles') // certifique-se que o nome da tabela está correto
            .update({ is_pro: true, stripe_customer_id: session.customer })
            .eq('email', session.customer_details.email);

        if (error) console.error('Erro ao atualizar Supabase:', error);
        else console.log('Pagamento confirmado e usuário atualizado!');
    }

    res.json({ received: true });
});

app.use(express.json());

// Rota para criar a sessão de pagamento
app.post('/api/create-checkout-session', async (req, res) => {
    const { priceId, userEmail } = req.body;

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'pix'], // Ativa o Pix aqui
            customer_email: userEmail,
            line_items: [{ price: priceId, quantity: 1 }],
            mode: 'subscription',
            success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/pricing`,
        });

        res.json({ url: session.url });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'CanvasSync API' }));

app.listen(3001, () => console.log('🚀 Backend CanvasSync rodando na porta 3001'));