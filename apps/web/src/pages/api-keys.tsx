import React, { useEffect, useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { PageHeader } from '../components/PageHeader';
import { withAuth } from '../lib/withAuth';
import { getApiKeys, createApiKey, revokeApiKey, ApiKey, CreateApiKeyResponse } from '../lib/api';
import styles from '../styles/ApiKeys.module.css';

function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [availableKeys, setAvailableKeys] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newKey, setNewKey] = useState<CreateApiKeyResponse | null>(null);
  const [formData, setFormData] = useState({ name: '', source_id: '' });

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    try {
      setLoading(true);
      const data = await getApiKeys();
      setApiKeys(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API keys');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const created = await createApiKey(formData.name, formData.source_id);
      setAvailableKeys((keys) => ({ ...keys, [created.id]: created.key }));
      setCopied(null);
      setNewKey(created);
      await fetchApiKeys();
      setShowForm(false);
      setFormData({ name: '', source_id: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) return;
    try {
      await revokeApiKey(id);
      setAvailableKeys((keys) => { const next = { ...keys }; delete next[id]; return next; });
      if (newKey?.id === id) setNewKey(null);
      await fetchApiKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke API key');
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setError(null);
    } catch {
      setError('Não foi possível copiar. Selecione a chave exibida e copie manualmente.');
    }
  };

  const handleGenerate = async (key: ApiKey) => {
    if (creating) return;
    setCreating(true);
    try {
      const created = await createApiKey(key.name, key.source_id);
      setAvailableKeys((keys) => ({ ...keys, [created.id]: created.key }));
      setNewKey(created);
      setCopied(null);
      await fetchApiKeys();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível gerar a chave.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="API Keys"
        description="Manage API keys for webhook sources"
        action={
          !showForm && (
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              + New API Key
            </button>
          )
        }
      />

      {error && <div className={styles.errorBanner}>{error}</div>}

      <p className={styles.description}>
        Gere uma nova chave para a mesma recepção se não guardou a anterior. A anterior continua ativa até ser revogada.
      </p>

      {newKey && (
        <div className={styles.successBanner}>
          <div className={styles.successContent}>
            <strong>API Key Created</strong>
            <p className={styles.warningText}>
              Copie e guarde esta chave. Após sair ou recarregar a página, ela não poderá ser recuperada.
            </p>
            <div className={styles.keyDisplay}>
              <code>{newKey.key}</code>
              <button className="btn-secondary" onClick={() => copyToClipboard(newKey.key)}>
                {copied === newKey.key ? 'Copiado!' : 'Copiar chave'}
              </button>
            </div>
            <p>Use nas requisições: <code>Authorization: Bearer &lt;sua-chave&gt;</code></p>
            <button className="btn-secondary" onClick={() => copyToClipboard(`Authorization: Bearer ${newKey.key}`)}>
              {copied === `Authorization: Bearer ${newKey.key}` ? 'Copiado!' : 'Copiar cabeçalho'}
            </button>
            <button className="btn-primary" onClick={() => setNewKey(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className={styles.formCard}>
          <h2>Create New API Key</h2>
          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label>Key Name *</label>
              <input
                type="text"
                required
                placeholder="e.g., Production API Key"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Source ID *</label>
              <input
                type="text"
                required
                placeholder="UUID da recepção"
                value={formData.source_id}
                onChange={(e) => setFormData({ ...formData, source_id: e.target.value })}
              />
            </div>

            <div className={styles.formActions}>
              <button type="submit" className="btn-primary" disabled={creating}>
                Create API Key
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowForm(false);
                  setFormData({ name: '', source_id: '' });
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className={styles.loadingState}>Loading API keys...</div>
      ) : apiKeys.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🔑</div>
          <h3>No API keys yet</h3>
          <p>Create your first API key to start sending requests</p>
        </div>
      ) : (
        <div className={styles.keysGrid}>
          {apiKeys.map((key) => (
            <div key={key.id} className={styles.keyCard}>
              <div className={styles.cardHeader}>
                <div>
                  <h3>{key.name}</h3>
                  <p className={styles.description}>Source: {key.source_name || key.source_id}</p>
                </div>
                {key.revoked_at && (
                  <span className="badge badge-error">Revoked</span>
                )}
              </div>

              <div className={styles.cardContent}>
                <div className={styles.keyInfo}>
                  <span className={styles.label}>Chave de API</span>
                  <span className={styles.value}>
                    {availableKeys[key.id] ? 'Disponível para copiar nesta sessão' : 'Chave salva como hash; o valor original não pode ser recuperado.'}
                  </span>
                </div>

                <div className={styles.keyInfo}>
                  <span className={styles.label}>Created</span>
                  <span className={styles.value}>{new Date(key.created_at).toLocaleDateString()}</span>
                </div>

                {key.last_used_at && (
                  <div className={styles.keyInfo}>
                    <span className={styles.label}>Last Used</span>
                    <span className={styles.value}>
                      {new Date(key.last_used_at).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              <div className={styles.cardFooter}>
                {!key.revoked_at && (
                  availableKeys[key.id] ? (
                    <button className="btn-primary" onClick={() => copyToClipboard(availableKeys[key.id])}>
                      {copied === availableKeys[key.id] ? 'Copiado!' : 'Copiar chave'}
                    </button>
                  ) : (
                    <button className="btn-primary" disabled={creating} onClick={() => handleGenerate(key)}>
                      Gerar nova chave para copiar
                    </button>
                  )
                )}
                {!key.revoked_at ? (
                  <button
                    className="btn-danger"
                    onClick={() => handleRevoke(key.id)}
                  >
                    Revoke
                  </button>
                ) : (
                  <span className={styles.revokedText}>This key has been revoked</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}

export default withAuth(ApiKeysPage);
