import jwt from 'jsonwebtoken';
import supabase from '../config/supabase.js';

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Busca usuário no banco para garantir que ainda existe
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, plan, subscription_status')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
};

export const requirePro = (req, res, next) => {
  if (req.user.plan !== 'pro' || req.user.subscription_status !== 'active') {
    return res.status(403).json({
      error: 'Acesso restrito ao plano Pro',
      code: 'PRO_REQUIRED',
    });
  }
  next();
};
