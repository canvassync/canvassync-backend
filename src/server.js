import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import paymentsRoutes from './routes/payments.js';
import webhookRoutes from './routes/webhooks.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: function(origin, callback) {
    const allowed = [
      process.env.FRONTEND_URL,
      'https://canvassync-frontend.vercel.app',
      'http://localhost:5173',
    ].filter(Boolean);
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── WEBHOOK do Stripe — DEVE vir ANTES do express.json() ────────────────────
// O Stripe exige o body RAW para validar a assinatura. Se você parsear como JSON
// antes, a validação falha com "No signatures found matching the expected signature".
app.use('/webhooks', webhookRoutes);

// ─── Body parser JSON (para todas as outras rotas) ────────────────────────────
app.use(express.json());

// ─── ROTAS ────────────────────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/payments', paymentsRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'CanvasSync API',
    timestamp: new Date().toISOString(),
  });
});

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// ─── Error handler global ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// ─── Inicia o servidor ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║  CanvasSync API rodando              ║
║  http://localhost:${PORT}              ║
║  Ambiente: ${process.env.NODE_ENV || 'development'}               ║
╚══════════════════════════════════════╝
  `);
});

export default app;
