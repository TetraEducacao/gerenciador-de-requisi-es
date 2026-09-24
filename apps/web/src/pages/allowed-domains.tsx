import React, { useEffect, useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { PageHeader } from '../components/PageHeader';
import { withAuth } from '../lib/withAuth';
import { getAllowedDomains, createAllowedDomain, updateAllowedDomain, deleteAllowedDomain, AllowedDomain } from '../lib/api';
import styles from '../styles/Destinations.module.css';

function AllowedDomainsPage() {
  const [domains, setDomains] = useState<AllowedDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ domain: '', description: '' });

  useEffect(() => {
    fetchDomains();
  }, []);

  const fetchDomains = async () => {
    try {
      setLoading(true);
      const data = await getAllowedDomains();
      setDomains(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load domains');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateAllowedDomain(editingId, {
          description: formData.description || undefined,
        });
      } else {
        await createAllowedDomain(formData.domain, formData.description || undefined);
      }
      await fetchDomains();
      setShowForm(false);
      setEditingId(null);
      setFormData({ domain: '', description: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save domain');
    }
  };

  const handleEdit = (domain: AllowedDomain) => {
    setEditingId(domain.id);
    setFormData({ domain: domain.domain, description: domain.description || '' });
    setShowForm(true);
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await updateAllowedDomain(id, { enabled: !enabled });
      await fetchDomains();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle domain');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure?')) return;
    try {
      await deleteAllowedDomain(id);
      await fetchDomains();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete domain');
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ domain: '', description: '' });
  };

  return (
    <AppLayout>
      <PageHeader
        title="Domínios Públicos"
        description="Gerenciar domínios que não precisam de autenticação"
        action={
          !showForm && (
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              + Adicionar Domínio
            </button>
          )
        }
      />

      {error && <div className={styles.errorBanner}>{error}</div>}

      {showForm && (
        <div className={styles.formCard}>
          <h2>{editingId ? 'Editar Domínio' : 'Adicionar Domínio'}</h2>
          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label>Domínio *</label>
              <input
                type="text"
                required
                placeholder="Ex: n8n-hook.tetraeducacao.com.br"
                value={formData.domain}
                onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                disabled={!!editingId}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Descrição</label>
              <textarea
                placeholder="Ex: Webhook do n8n"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className={styles.formActions}>
              <button type="submit" className="btn-primary">
                {editingId ? 'Atualizar' : 'Adicionar'} Domínio
              </button>
              <button type="button" className="btn-secondary" onClick={handleCancel}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className={styles.loadingState}>Carregando domínios...</div>
      ) : domains.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🔓</div>
          <h3>Nenhum domínio adicionado</h3>
          <p>Adicione domínios que podem enviar requisições sem autenticação</p>
        </div>
      ) : (
        <div className={styles.destinationsGrid}>
          {domains.map((domain) => (
            <div key={domain.id} className={styles.destinationCard}>
              <div className={styles.cardHeader}>
                <div>
                  <h3>{domain.domain}</h3>
                  {domain.description && <p className={styles.description}>{domain.description}</p>}
                </div>
                <button
                  className={`badge ${domain.enabled ? 'badge-success' : 'badge-error'}`}
                  onClick={() => handleToggle(domain.id, domain.enabled)}
                >
                  {domain.enabled ? 'Ativo' : 'Inativo'}
                </button>
              </div>

              <div className={styles.cardFooter}>
                <small className={styles.timestamp}>
                  Adicionado em {new Date(domain.created_at).toLocaleDateString('pt-BR')}
                </small>
                <div className={styles.actions}>
                  <button className="btn-secondary" onClick={() => handleEdit(domain)}>
                    Editar
                  </button>
                  <button className="btn-danger" onClick={() => handleDelete(domain.id)}>
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

export default withAuth(AllowedDomainsPage);
