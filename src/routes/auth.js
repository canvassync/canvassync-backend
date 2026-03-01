import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import supabase from '../config/supabase.js';
import stripe from '../config/stripe.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// ─── Gerar JWT ────────────────────────────────────────────────────────────────
const generateToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });

// ─── POST /auth/register ─────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    }

    // Verifica se email já existe
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }

    // Hash da senha
    const password_hash = await bcrypt.hash(password, 12);

    // Cria cliente no Stripe
    const stripeCustomer = await stripe.customers.create({
      email: email.toLowerCase(),
      name: name || '',
      metadata: { source: 'canvassync' },
    });

    // Insere usuário no banco
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase(),
        password_hash,
        name: name || '',
        plan: 'free',
        stripe_customer_id: stripeCustomer.id,
      })
      .select('id, email, name, plan, subscription_status')
      .single();

    if (error) throw error;

    const token = generateToken(user.id);

    return res.status(201).json({
      message: 'Conta criada com sucesso',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        subscriptionStatus: user.subscription_status,
      },
    });
  } catch (err) {
    console.error('[REGISTER]', err);
    return res.status(500).json({ error: 'Erro interno ao criar conta' });
  }
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, plan, subscription_status, password_hash')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    const token = generateToken(user.id);

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        subscriptionStatus: user.subscription_status,
      },
    });
  } catch (err) {
    console.error('[LOGIN]', err);
    return res.status(500).json({ error: 'Erro interno ao fazer login' });
  }
});

// ─── POST /auth/google-callback ──────────────────────────────────────────────
// Recebe o access_token do Supabase OAuth e retorna um JWT próprio
router.post('/google-callback', async (req, res) => {
  try {
    const { access_token } = req.body;
    if (!access_token) return res.status(400).json({ error: 'Token ausente' });

    // Busca os dados do usuário no Supabase usando o access_token
    const { data: { user: supaUser }, error: userError } = await supabase.auth.getUser(access_token);
    if (userError || !supaUser) return res.status(401).json({ error: 'Token inválido' });

    const email = supaUser.email?.toLowerCase();
    const name  = supaUser.user_metadata?.full_name || supaUser.user_metadata?.name || '';

    // Verifica se já existe no banco
    let { data: existing } = await supabase
      .from('users')
      .select('id, email, name, plan, subscription_status')
      .eq('email', email)
      .single();

    if (!existing) {
      // Primeiro login com Google — cria conta automaticamente
      const stripeCustomer = await stripe.customers.create({
        email,
        name,
        metadata: { source: 'canvassync_google' },
      });

      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({ email, name, plan: 'free', stripe_customer_id: stripeCustomer.id, password_hash: '' })
        .select('id, email, name, plan, subscription_status')
        .single();

      if (insertError) throw insertError;
      existing = newUser;
    }

    const token = generateToken(existing.id);
    return res.json({
      token,
      user: {
        id: existing.id,
        email: existing.email,
        name: existing.name,
        plan: existing.plan,
        subscriptionStatus: existing.subscription_status,
      },
    });
  } catch (err) {
    console.error('[GOOGLE-CALLBACK]', err);
    return res.status(500).json({ error: 'Erro ao processar login com Google' });
  }
});

// ─── GET /auth/me ─────────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  const { data: user } = await supabase
    .from('users')
    .select('id, email, name, plan, subscription_status, subscription_end_date, created_at')
    .eq('id', req.user.id)
    .single();

  return res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    subscriptionStatus: user.subscription_status,
    subscriptionEndDate: user.subscription_end_date,
    memberSince: user.created_at,
  });
});

export default router;
