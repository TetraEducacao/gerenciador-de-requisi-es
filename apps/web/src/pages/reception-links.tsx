import React, { useEffect, useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { PageHeader } from '../components/PageHeader';
import { withAuth } from '../lib/withAuth';
import styles from '../styles/ReceptionLinks.module.css';

interface ReceptionLink {
  id: string;
  sourceId: string;
  sourceName: string;
  destinationId: string;
  destinationName: string;
  createdAt: string;
}

interface Reception {
  id: string;
  name: string;
}

interface Destination {
  id: string;
  name: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function ReceptionLinksPage() {
  const [links, setLinks] = useState<ReceptionLink[]>([]);
  const [receptions, setReceptions] = useState<Reception[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedReception, setSelectedReception] = useState('');
  const [selectedDestination, setSelectedDestination] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

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

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = await getToken();

      // Fetch links
      const linksRes = await fetch(`${API_BASE}/admin/reception-destinations`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!linksRes.ok) throw new Error('Não foi possível carregar os vínculos de recepção.');
      if (linksRes.ok) {
        const data = await linksRes.json();
        setLinks(data.data || []);
      }

      // Fetch sources
      const sourcesRes = await fetch(`${API_BASE}/admin/sources`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!sourcesRes.ok) throw new Error('Não foi possível carregar as recepções.');
      if (sourcesRes.ok) {
        const data = await sourcesRes.json();
        setReceptions(
          (data.data || []).map((s: any) => ({
            id: s.sourceId,
            name: s.name,
          }))
        );
      }

      // Fetch destinations
      const destRes = await fetch(`${API_BASE}/admin/destinations`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!destRes.ok) throw new Error('Não foi possível carregar os destinos.');
      if (destRes.ok) {
        const data = await destRes.json();
        setDestinations(
          (data.data || []).map((d: any) => ({
            id: d.id,
            name: d.name,
          }))
        );
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReception || !selectedDestination) return;

    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE}/admin/reception-destinations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceId: selectedReception,
          destinationId: selectedDestination,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error?.error?.message || 'Failed to create link');
      }

      setSelectedReception('');
      setSelectedDestination('');
      setShowForm(false);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create link');
    }
  };

  const handleDeleteLink = async (sourceId: string) => {
    if (!confirm('Tem certeza que quer remover este vínculo?')) return;

    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE}/admin/reception-destinations/${sourceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to delete link');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete link');
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Vínculos de Recepção"
        description="Configure para onde cada recepção deve encaminhar as requisições"
        action={
          !showForm && (
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              + Novo Vínculo
            </button>
          )
        }
      />

      {error && <div className={styles.errorBanner}>{error}</div>}

      {showForm && (
        <div className={styles.formCard}>
          <h2>Novo Vínculo: Recepção → Destino</h2>
          <form onSubmit={handleCreateLink}>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Recepção *</label>
                <select
                  required
                  value={selectedReception}
                  onChange={(e) => setSelectedReception(e.target.value)}
                >
                  <option value="">Selecione uma recepção</option>
                  {receptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Destino *</label>
                <select
                  required
                  value={selectedDestination}
                  onChange={(e) => setSelectedDestination(e.target.value)}
                >
                  <option value="">Selecione um destino</option>
                  {destinations.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.formActions}>
              <button type="submit" className="btn-primary">
                Vincular
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowForm(false);
                  setSelectedReception('');
                  setSelectedDestination('');
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className={styles.loadingState}>Carregando...</div>
      ) : links.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🔗</div>
          <h3>Nenhum Vínculo Configurado</h3>
          <p>Crie seu primeiro vínculo para conectar uma recepção a um destino</p>
        </div>
      ) : (
        <div className={styles.linksList}>
          {links.map((link) => (
            <div key={link.id} className={styles.linkCard}>
              <div className={styles.cardContent}>
                <div className={styles.linkFlow}>
                  <div className={styles.flowItem}>
                    <span className={styles.label}>RECEPÇÃO</span>
                    <span className={styles.value}>{link.sourceName}</span>
                  </div>
                  <span className={styles.arrow}>→</span>
                  <div className={styles.flowItem}>
                    <span className={styles.label}>DESTINO</span>
                    <span className={styles.value}>{link.destinationName}</span>
                  </div>
                </div>

                <div className={styles.details}>
                  <small>Criado em {new Date(link.createdAt).toLocaleDateString('pt-BR')}</small>
                </div>
              </div>

              <div className={styles.cardFooter}>
                <button
                  className="btn-danger"
                  onClick={() => handleDeleteLink(link.sourceId)}
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}

export default withAuth(ReceptionLinksPage);
