import React, { useEffect, useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { PageHeader } from '../components/PageHeader';
import { withAuth } from '../lib/withAuth';
import styles from '../styles/Sources.module.css';

interface Source {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
  status: 'active' | 'revoked';
  sourceId: string;
}

interface CreateSourceResponse {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  status: string;
  message: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/admin/sources`, {
        headers: {
          'Authorization': `Bearer ${await getToken()}`,
        },
      });

      if (!response.ok) throw new Error('Failed to load sources');
      const data = await response.json();
      setSources(data.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sources');
    } finally {
      setLoading(false);
    }
  };

  const getToken = async () => {
    if (typeof window !== 'undefined') {
      try {
        const { getAccessToken } = await import('../lib/supabase');
        return await getAccessToken();
      } catch {
        return '';
      }
    }
    return '';
  };

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceName.trim()) return;

    try {
      const response = await fetch(`${API_BASE}/admin/sources`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newSourceName }),
      });

      if (!response.ok) throw new Error('Failed to create source');
      const data = (await response.json()) as { data: CreateSourceResponse };

      setCreatedKey(data.data.key);
      setNewSourceName('');
      await fetchSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create source');
    }
  };

  const handleDeleteSource = async (id: string) => {
    if (!confirm('Are you sure? This will revoke the integration.')) return;

    try {
      const response = await fetch(`${API_BASE}/admin/sources/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${await getToken()}`,
        },
      });

      if (!response.ok) throw new Error('Failed to delete source');
      await fetchSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete source');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <AppLayout>
      <PageHeader
        title="Recepções"
        description="Integrations receiving requests from your systems"
        action={
          !showForm && (
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              + Nova Recepção
            </button>
          )
        }
      />

      {error && <div className={styles.errorBanner}>{error}</div>}

      {createdKey && (
        <div className={styles.successCard}>
          <h3>✓ Recepção Criada!</h3>
          <p>Chave de API gerada. Guarde em lugar seguro:</p>
          <div className={styles.keyContainer}>
            <code>{createdKey}</code>
            <button
              className="btn-secondary"
              onClick={() => copyToClipboard(createdKey)}
            >
              {copiedKey ? '✓ Copiada' : 'Copiar'}
            </button>
          </div>
          <p className={styles.note}>
            Use esta chave no seu Sistema de Vendas para fazer POST em:<br/>
            <code>POST {API_BASE}/v1/requests</code>
          </p>
          <button className="btn-primary" onClick={() => setCreatedKey(null)}>
            Ok
          </button>
        </div>
      )}

      {showForm && (
        <div className={styles.formCard}>
          <h2>Nova Recepção</h2>
          <form onSubmit={handleCreateSource}>
            <div className={styles.formGroup}>
              <label>Nome da Integração *</label>
              <input
                type="text"
                placeholder="Ex: Sistema de Vendas, E-commerce, etc"
                required
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
                autoFocus
              />
            </div>

            <div className={styles.formActions}>
              <button type="submit" className="btn-primary">
                Criar Recepção
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowForm(false);
                  setNewSourceName('');
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className={styles.loadingState}>Loading sources...</div>
      ) : sources.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🔌</div>
          <h3>Nenhuma Recepção Configurada</h3>
          <p>Crie sua primeira integração para começar a receber requisições</p>
        </div>
      ) : (
        <div className={styles.sourcesList}>
          {sources.map((source) => (
            <div key={source.id} className={styles.sourceCard}>
              <div className={styles.cardHeader}>
                <div>
                  <h3>{source.name}</h3>
                  <p className={styles.id}>ID: {source.id}</p>
                </div>
                <span className={`badge ${source.status === 'active' ? 'badge-success' : 'badge-error'}`}>
                  {source.status === 'active' ? 'Ativa' : 'Revogada'}
                </span>
              </div>

              <div className={styles.cardContent}>
                <div className={styles.apiUrl}>
                  <label>URL de Recepção:</label>
                  <code>{API_BASE}/v1/requests/{source.sourceId}</code>
                </div>

                <div className={styles.details}>
                  <div>
                    <span className={styles.label}>Criada em</span>
                    <span>{new Date(source.createdAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                  {source.lastUsedAt && (
                    <div>
                      <span className={styles.label}>Último uso</span>
                      <span>{new Date(source.lastUsedAt).toLocaleDateString('pt-BR')}</span>
                    </div>
                  )}
                </div>

                {source.status === 'active' && (
                  <div className={styles.instruction}>
                    <strong>Como usar:</strong>
                    <code>
{`curl -X POST ${API_BASE}/v1/requests/${source.sourceId} \\
  -H "Content-Type: application/json" \\
  -d '{"destination_id": "destino-id", "payload": {"dados": "aqui"}}'`}
                    </code>
                  </div>
                )}
              </div>

              <div className={styles.cardFooter}>
                {source.status === 'active' && (
                  <button
                    className="btn-danger"
                    onClick={() => handleDeleteSource(source.id)}
                  >
                    Revogar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}

export default withAuth(SourcesPage);
