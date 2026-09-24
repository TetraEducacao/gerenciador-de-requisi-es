import React, { useEffect, useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { PageHeader } from '../components/PageHeader';
import { withAuth } from '../lib/withAuth';
import styles from '../styles/Destinations.module.css';

interface TokenListItem {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function ExternalTokensPage() {
  const [tokens, setTokens] = useState<TokenListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchTokens();
  }, []);

  const fetchTokens = async () => {
    try {
      setLoading(true);
      const { getAccessToken } = await import('../lib/supabase');
      const token = await getAccessToken();
      const response = await fetch(`${API_BASE}/admin/external-tokens`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setTokens(data.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tokens');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { getAccessToken } = await import('../lib/supabase');
      const token = await getAccessToken();
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `/admin/external-tokens/${editingId}` : '/admin/external-tokens';

      const response = await fetch(`${API_BASE}${url}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
        }),
      });

      if (!response.ok) throw new Error('Failed to save');
      const responseData = await response.json();

      if (method === 'POST') {
        // Show newly created token
        alert(`Token criado:\n\n${responseData.data.token}\n\nCopie e salve em local seguro!`);
      }

      await fetchTokens();
      setShowForm(false);
      setEditingId(null);
      setFormData({ name: '', description: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save token');
    }
  };

  const handleEdit = (token: TokenListItem) => {
    setEditingId(token.id);
    setFormData({ name: token.name, description: token.description || '' });
    setShowForm(true);
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      const { getAccessToken } = await import('../lib/supabase');
      const token = await getAccessToken();
      const response = await fetch(`${API_BASE}/admin/external-tokens/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (!response.ok) throw new Error('Failed to toggle');
      await fetchTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle token');
    }
  };

  const handleRegenerate = async (id: string) => {
    if (!confirm('Gerar novo token? O token anterior deixará de funcionar.')) return;
    try {
      const { getAccessToken } = await import('../lib/supabase');
      const token = await getAccessToken();
      const response = await fetch(`${API_BASE}/admin/external-tokens/${id}/regenerate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to regenerate');
      const data = await response.json();
      alert(`Novo token:\n\n${data.data.token}\n\nCopie e salve em local seguro!`);
      await fetchTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate token');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deletar token?')) return;
    try {
      const { getAccessToken } = await import('../lib/supabase');
      const token = await getAccessToken();
      const response = await fetch(`${API_BASE}/admin/external-tokens/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to delete');
      await fetchTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete token');
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: '', description: '' });
  };

  return (
    <AppLayout>
      <PageHeader
        title="Tokens de Terceiros"
        description="Autorizar Guru, n8n, Zapier e outros serviços"
        action={
          !showForm && (
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              + Novo Token
            </button>
          )
        }
      />

      {error && <div className={styles.errorBanner}>{error}</div>}

      {showForm && (
        <div className={styles.formCard}>
          <h2>{editingId ? 'Editar Token' : 'Novo Token'}</h2>
          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label>Nome *</label>
              <input
                type="text"
                required
                placeholder="Ex: Guru, n8n, Zapier"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Descrição</label>
              <textarea
                placeholder="Ex: Token do webhook da Guru"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className={styles.formActions}>
              <button type="submit" className="btn-primary">
                {editingId ? 'Atualizar' : 'Criar'} Token
              </button>
              <button type="button" className="btn-secondary" onClick={handleCancel}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className={styles.loadingState}>Carregando tokens...</div>
      ) : tokens.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🔐</div>
          <h3>Nenhum token criado</h3>
          <p>Crie tokens para autorizar requisições de serviços externos</p>
        </div>
      ) : (
        <div className={styles.destinationsGrid}>
          {tokens.map((tokenItem) => (
            <div key={tokenItem.id} className={styles.destinationCard}>
              <div className={styles.cardHeader}>
                <div>
                  <h3>{tokenItem.name}</h3>
                  {tokenItem.description && <p className={styles.description}>{tokenItem.description}</p>}
                </div>
                <button
                  className={`badge ${tokenItem.enabled ? 'badge-success' : 'badge-error'}`}
                  onClick={() => handleToggle(tokenItem.id, tokenItem.enabled)}
                >
                  {tokenItem.enabled ? 'Ativo' : 'Inativo'}
                </button>
              </div>

              <div className={styles.cardFooter}>
                <small className={styles.timestamp}>
                  Criado em {new Date(tokenItem.created_at).toLocaleDateString('pt-BR')}
                </small>
                <div className={styles.actions}>
                  <button className="btn-secondary" onClick={() => handleEdit(tokenItem)}>
                    Editar
                  </button>
                  <button className="btn-secondary" onClick={() => handleRegenerate(tokenItem.id)}>
                    Gerar novo
                  </button>
                  <button className="btn-danger" onClick={() => handleDelete(tokenItem.id)}>
                    Deletar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}

export default withAuth(ExternalTokensPage);
