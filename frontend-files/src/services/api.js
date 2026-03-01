// src/services/api.js
// Serviço centralizado para comunicação com o backend CanvasSync

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ─── Helper para requisições autenticadas ─────────────────────────────────────
async function request(path, options = {}) {
  const token = localStorage.getItem('canvassync_token');

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  };

  const res = await fetch(`${API_URL}${path}`, config);
  const data = await res.json();

  if (!res.ok) {
    // Token expirado — limpa sessão
    if (data.code === 'TOKEN_EXPIRED') {
      localStorage.removeItem('canvassync_token');
      localStorage.removeItem('canvassync_user');
      window.location.href = '/entrar';
    }
    throw new Error(data.error || 'Erro desconhecido');
  }

  return data;
}

// ════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════

export const authApi = {
  /** Cria conta nova */
  register: (email, password, name) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),

  /** Login */
  login: (email, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  /** Retorna dados do usuário logado */
  me: () => request('/auth/me'),
};

// ════════════════════════════════════════════════════════════
// PAGAMENTOS
// ════════════════════════════════════════════════════════════

export const paymentsApi = {
  /**
   * Cria sessão de checkout e redireciona para o Stripe
   * @param {'pro_monthly'|'pro_annual'} plan
   * @param {'card'|'pix'} paymentMethod
   */
  checkout: async (plan, paymentMethod = 'card') => {
    const data = await request('/payments/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan, paymentMethod }),
    });
    // Redireciona para página do Stripe
    window.location.href = data.url;
  },

  /** Abre portal de gerenciamento de assinatura do Stripe */
  openPortal: async () => {
    const data = await request('/payments/portal', { method: 'POST' });
    window.location.href = data.url;
  },

  /** Status atual da assinatura */
  getStatus: () => request('/payments/status'),
};

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

/** Salva token e usuário no localStorage */
export function saveSession(token, user) {
  localStorage.setItem('canvassync_token', token);
  localStorage.setItem('canvassync_user', JSON.stringify(user));
}

/** Limpa sessão */
export function clearSession() {
  localStorage.removeItem('canvassync_token');
  localStorage.removeItem('canvassync_user');
}

/** Retorna usuário do localStorage (sem requisição) */
export function getCachedUser() {
  try {
    return JSON.parse(localStorage.getItem('canvassync_user'));
  } catch {
    return null;
  }
}

/** Verifica se usuário tem plano Pro ativo */
export function isPro(user) {
  return user?.plan === 'pro' && user?.subscriptionStatus === 'active';
}
