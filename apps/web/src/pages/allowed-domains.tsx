import React, { useEffect, useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { PageHeader } from '../components/PageHeader';
import { withAuth } from '../lib/withAuth';
import styles from '../styles/Destinations.module.css';

interface AllowedDomain {
  id: string;
  domain: string;
  description?: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

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
      const token = await (await import('../lib/supabase')).getAccessToken();
      const response = await fetch('http://localhost:3001/admin/allowed-domains', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setDomains(data.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load domains');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = await (await import('../lib/supabase')).getAccessToken();
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `/admin/allowed-domains/${editingId}` : '/admin/allowed-domains';

      const response = await fetch(`http://localhost:3001${url}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain: formData.domain,
          description: formData.description || null,
        }),
      });

      if (!response.ok) throw new Error('Failed to save');
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
      const token = await (await import('../lib/supabase')).getAccessToken();
      const response = await fetch(`http://localhost:3001/admin/allowed-domains/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (!response.ok) throw new Error('Failed to toggle');
      await fetchDomains();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle domain');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure?')) return;
    try {
      const token = await (await import('../lib/supabase')).getAccessToken();
      const response = await fetch(`http://localhost:3001/admin/allowed-domains/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to delete');
      await fetchDomains();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete domain');
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Allowed Domains"
        description="Manage domains that don't require authentication"
        action={
          !showForm && (
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              + Add Domain
            </button>
          )
        }
      />

      {error && <div className={styles.errorBanner}>{error}</div>}

      {showForm && (
        <div className={styles.formCard}>
          <h2>{editingId ? 'Edit Domain' : 'Add Domain'}</h2>
          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label>Domain *</label>
              <input
                type="text"
                required
                placeholder="e.g., n8n-hook.tetraeducacao.com.br"
                value={formData.domain}
                onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Description</label>
              <textarea
                placeholder="e.g., n8n webhook endpoint"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className={styles.formActions}>
              <button type="submit" className="btn-primary">
                {editingId ? 'Update' : 'Add'} Domain
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  setFormData({ domain: '', description: '' });
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className={styles.loadingState}>Loading domains...</div>
      ) : domains.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🔓</div>
          <h3>No domains added yet</h3>
          <p>Add domains that are allowed to send requests without authentication</p>
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
                  {domain.enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div className={styles.cardFooter}>
                <small className={styles.timestamp}>
                  Added {new Date(domain.created_at).toLocaleDateString()}
                </small>
                <div className={styles.actions}>
                  <button className="btn-secondary" onClick={() => handleEdit(domain)}>
                    Edit
                  </button>
                  <button className="btn-danger" onClick={() => handleDelete(domain.id)}>
                    Delete
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
