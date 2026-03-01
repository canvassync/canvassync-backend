// src/pages/Checkout.jsx
// Página de seleção de plano e método de pagamento

import { useState } from 'react';
import { paymentsApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';

export default function CheckoutPage() {
  const { user, isLoggedIn } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState('pro_monthly');
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // PIX só está disponível para plano anual
  const pixAvailable = selectedPlan === 'pro_annual';

  const handleCheckout = async () => {
    if (!isLoggedIn) {
      window.location.href = '/entrar?redirect=/planos';
      return;
    }

    setLoading(true);
    setError('');

    try {
      await paymentsApi.checkout(selectedPlan, paymentMethod);
      // O redirect acontece dentro de paymentsApi.checkout()
    } catch (err) {
      setError(err.message || 'Erro ao iniciar pagamento. Tente novamente.');
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#080808',
      color: '#f0f0f0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      fontFamily: 'DM Sans, system-ui, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, textAlign: 'center' }}>
          Assinar CanvasSync Pro
        </h1>
        <p style={{ color: '#666', textAlign: 'center', marginBottom: 40, fontSize: 15 }}>
          7 dias de teste grátis · Cancele quando quiser
        </p>

        {/* Seleção de plano */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 12, color: '#555', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>
            Período
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { id: 'pro_monthly', label: 'Mensal', price: 'R$ 29,90/mês', sub: '' },
              { id: 'pro_annual', label: 'Anual', price: 'R$ 299/ano', sub: '≈ R$ 24,92/mês — -17%' },
            ].map(plan => (
              <div
                key={plan.id}
                onClick={() => {
                  setSelectedPlan(plan.id);
                  // Se mudar para mensal, força cartão (PIX não disponível)
                  if (plan.id === 'pro_monthly') setPaymentMethod('card');
                }}
                style={{
                  border: selectedPlan === plan.id
                    ? '2px solid #00BFFF'
                    : '2px solid rgba(255,255,255,0.07)',
                  borderRadius: 14,
                  padding: '16px 18px',
                  cursor: 'pointer',
                  background: selectedPlan === plan.id ? 'rgba(0,191,255,0.05)' : '#111',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{plan.label}</div>
                <div style={{ color: '#00BFFF', fontWeight: 700, fontSize: 18 }}>{plan.price}</div>
                {plan.sub && (
                  <div style={{ color: '#555', fontSize: 12, marginTop: 4 }}>{plan.sub}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Seleção de método de pagamento */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 12, color: '#555', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>
            Forma de pagamento
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {/* Cartão */}
            <div
              onClick={() => setPaymentMethod('card')}
              style={{
                border: paymentMethod === 'card' ? '2px solid #00BFFF' : '2px solid rgba(255,255,255,0.07)',
                borderRadius: 14, padding: '14px 16px', cursor: 'pointer',
                background: paymentMethod === 'card' ? 'rgba(0,191,255,0.05)' : '#111',
                display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.2s',
              }}
            >
              <span style={{ fontSize: 22 }}>💳</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Cartão</div>
                <div style={{ color: '#555', fontSize: 11 }}>Crédito / Débito</div>
              </div>
            </div>

            {/* PIX */}
            <div
              onClick={() => pixAvailable && setPaymentMethod('pix')}
              style={{
                border: paymentMethod === 'pix' ? '2px solid #00BFFF' : '2px solid rgba(255,255,255,0.07)',
                borderRadius: 14, padding: '14px 16px',
                cursor: pixAvailable ? 'pointer' : 'not-allowed',
                background: paymentMethod === 'pix'
                  ? 'rgba(0,191,255,0.05)'
                  : pixAvailable ? '#111' : '#0a0a0a',
                opacity: pixAvailable ? 1 : 0.4,
                display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.2s',
              }}
            >
              <span style={{ fontSize: 22 }}>🏦</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>PIX</div>
                <div style={{ color: '#555', fontSize: 11 }}>
                  {pixAvailable ? 'Pagamento instantâneo' : 'Apenas plano anual'}
                </div>
              </div>
            </div>
          </div>

          {paymentMethod === 'pix' && (
            <div style={{
              background: 'rgba(0,191,255,0.05)', border: '1px solid rgba(0,191,255,0.15)',
              borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 12, color: '#888',
            }}>
              💡 O QR Code PIX aparece na próxima tela. Você terá 30 minutos para pagar.
              Após confirmação, o acesso Pro é liberado automaticamente.
            </div>
          )}
        </div>

        {/* Resumo */}
        <div style={{
          background: '#111', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 14, padding: '18px 20px', marginBottom: 20,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: '#888', fontSize: 14 }}>Plano Pro {selectedPlan === 'pro_annual' ? 'Anual' : 'Mensal'}</span>
            <span style={{ fontWeight: 700, color: '#00BFFF' }}>
              {selectedPlan === 'pro_annual' ? 'R$ 299,00' : 'R$ 29,90'}
            </span>
          </div>
          {selectedPlan === 'pro_monthly' && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#555', fontSize: 12 }}>7 dias de teste grátis</span>
              <span style={{ color: '#00BFFF', fontSize: 12 }}>Incluído</span>
            </div>
          )}
        </div>

        {/* Erro */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 10, padding: '12px 16px', marginBottom: 16,
            color: '#f87171', fontSize: 14,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Botão de checkout */}
        <button
          onClick={handleCheckout}
          disabled={loading}
          style={{
            width: '100%', padding: '15px 0',
            background: loading ? '#1a3a4a' : '#00BFFF',
            color: loading ? '#555' : '#000',
            fontWeight: 700, fontSize: 16,
            border: 'none', borderRadius: 12,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {loading
            ? 'Aguardando...'
            : isLoggedIn
              ? `Pagar com ${paymentMethod === 'pix' ? 'PIX' : 'Cartão'}`
              : 'Criar conta e assinar'}
        </button>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#333', marginTop: 14 }}>
          🔒 Pagamento seguro via Stripe · SSL 256-bit
        </p>
      </div>
    </div>
  );
}
