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
  filterRules?: {
    user_agent?: string;
    headers?: Record<string, string>;
    payload?: Record<string, unknown>;
  } | null;
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
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filteringLink, setFilteringLink] = useState<ReceptionLink | null>(null);
  const [payloadEdits, setPayloadEdits] = useState<Record<string, string>>({});
  const [filterError, setFilterError] = useState<string | null>(null);
  const [filterForm, setFilterForm] = useState({
    user_agent: '',
    headers: {} as Record<string, string>,
    payload: {} as Record<string, unknown>,
    headerKey: '',
    headerValue: '',
    payloadKey: '',
    payloadValue: '',
  });

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

  const handleDeleteLink = async (sourceId: string, destinationId: string) => {
    if (!confirm('Tem certeza que quer remover este vínculo?')) return;

    try {
      const token = await getToken();
      const url = `${API_BASE}/admin/reception-destinations/${sourceId}?destinationId=${destinationId}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to delete link');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete link');
    }
  };

  const handleOpenFilterModal = (link: ReceptionLink) => {
    setPayloadEdits({});
    setFilterError(null);
    setFilteringLink(link);
    setFilterForm({
      user_agent: link.filterRules?.user_agent || '',
      headers: link.filterRules?.headers || {},
      payload: link.filterRules?.payload || {},
      headerKey: '',
      headerValue: '',
      payloadKey: '',
      payloadValue: '',
    });
    setShowFilterModal(true);
  };

  const handleSaveFilters = async () => {
    if (!filteringLink) return;

    try {
      setFilterError(null);
      const payload = { ...filterForm.payload };
      for (const [key, text] of Object.entries(payloadEdits)) {
        if (!(key in payload)) continue;
        if (typeof payload[key] === 'string') {
          payload[key] = text;
        } else {
          try {
            payload[key] = JSON.parse(text);
          } catch {
            throw new Error(`Informe um valor JSON válido para o campo ${key}.`);
          }
        }
      }
      const token = await getToken();
      const filterRules = {
        ...(filterForm.user_agent && { user_agent: filterForm.user_agent }),
        ...(Object.keys(filterForm.headers).length > 0 && { headers: filterForm.headers }),
        ...(Object.keys(payload).length > 0 && { payload }),
      };

      const response = await fetch(
        `${API_BASE}/admin/reception-destinations/${filteringLink.sourceId}/${filteringLink.destinationId}/filter-rules`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ filter_rules: Object.keys(filterRules).length > 0 ? filterRules : null }),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err?.error?.message || 'Failed to save filters');
      }

      setShowFilterModal(false);
      await fetchData();
    } catch (err) {
      setFilterError(err instanceof Error ? err.message : 'Não foi possível salvar os filtros.');
    }
  };

  return (
    <AppLayout>
      {showFilterModal && filteringLink && (
        <div className={styles.modalOverlay} onClick={() => setShowFilterModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Configurar Filtros</h2>
              <button className="btn-secondary" onClick={() => setShowFilterModal(false)}>✕</button>
            </div>

            <div className={styles.modalBody}>
              {filterError && <div role="alert" className={styles.errorBanner}>{filterError}</div>}
              <p style={{ marginBottom: '16px', color: '#94a3b8', fontSize: '13px' }}>
                Defina condições para este destino receber webhooks
              </p>

              {/* User-Agent Filter */}
              <div className={styles.filterSection}>
                <label>User-Agent (opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: GuzzleHttp/7, axios/1.20.0"
                  value={filterForm.user_agent}
                  onChange={(e) => setFilterForm({ ...filterForm, user_agent: e.target.value })}
                />
              </div>

              {/* Headers Filter */}
              <div className={styles.filterSection}>
                <label>Headers (opcional)</label>
                <div className={styles.keyValueList}>
                  {Object.entries(filterForm.headers).map(([key, value]) => (
                    <div key={key} className={styles.keyValueItem}>
                      <label className={styles.savedFilter}>
                        <span>{key}</span>
                        <input
                          aria-label={`Header ${key}`}
                          value={value}
                          onChange={(e) => setFilterForm({
                            ...filterForm,
                            headers: { ...filterForm.headers, [key]: e.target.value },
                          })}
                        />
                      </label>
                      <button
                        className="btn-small-danger"
                        onClick={() => {
                          const newHeaders = { ...filterForm.headers };
                          delete newHeaders[key];
                          setFilterForm({ ...filterForm, headers: newHeaders });
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Nome do header"
                    value={filterForm.headerKey}
                    onChange={(e) => setFilterForm({ ...filterForm, headerKey: e.target.value })}
                  />
                  <input
                    type="text"
                    placeholder="Valor"
                    value={filterForm.headerValue}
                    onChange={(e) => setFilterForm({ ...filterForm, headerValue: e.target.value })}
                  />
                  <button
                    className="btn-primary"
                    onClick={() => {
                      if (filterForm.headerKey && filterForm.headerValue) {
                        setFilterForm({
                          ...filterForm,
                          headers: { ...filterForm.headers, [filterForm.headerKey]: filterForm.headerValue },
                          headerKey: '',
                          headerValue: '',
                        });
                      }
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Payload Filter */}
              <div className={styles.filterSection}>
                <label>Payload (opcional)</label>
                <div className={styles.keyValueList}>
                  {Object.entries(filterForm.payload).map(([key, value]) => (
                    <div key={key} className={styles.keyValueItem}>
                      <label className={styles.savedFilter}>
                        <span>{key}</span>
                        <input
                          aria-label={`Payload ${key}`}
                          value={payloadEdits[key] ?? (typeof value === 'string' ? value : JSON.stringify(value))}
                          onChange={(e) => setPayloadEdits({ ...payloadEdits, [key]: e.target.value })}
                        />
                      </label>
                      <button
                        className="btn-small-danger"
                        onClick={() => {
                          const newPayload = { ...filterForm.payload };
                          delete newPayload[key];
                          setPayloadEdits((current) => {
                            const next = { ...current };
                            delete next[key];
                            return next;
                          });
                          setFilterForm({ ...filterForm, payload: newPayload });
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Campo (ex: status, object)"
                    value={filterForm.payloadKey}
                    onChange={(e) => setFilterForm({ ...filterForm, payloadKey: e.target.value })}
                  />
                  <input
                    type="text"
                    placeholder="Valor (ex: PAID, order)"
                    value={filterForm.payloadValue}
                    onChange={(e) => setFilterForm({ ...filterForm, payloadValue: e.target.value })}
                  />
                  <button
                    className="btn-primary"
                    onClick={() => {
                      if (filterForm.payloadKey && filterForm.payloadValue) {
                        setFilterForm({
                          ...filterForm,
                          payload: { ...filterForm.payload, [filterForm.payloadKey]: filterForm.payloadValue },
                          payloadKey: '',
                          payloadValue: '',
                        });
                      }
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className="btn-secondary" onClick={() => setShowFilterModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSaveFilters}>Salvar Filtros</button>
            </div>
          </div>
        </div>
      )}

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
          {Object.entries(
            links.reduce((acc: Record<string, ReceptionLink[]>, link) => {
              if (!acc[link.sourceId]) acc[link.sourceId] = [];
              acc[link.sourceId].push(link);
              return acc;
            }, {})
          ).map(([sourceId, sourceLinks]) => (
            <div key={sourceId} className={styles.linkCard}>
              <div className={styles.cardContent}>
                <div className={styles.linkFlow}>
                  <div className={styles.flowItem}>
                    <span className={styles.label}>RECEPÇÃO</span>
                    <span className={styles.value}>{sourceLinks[0].sourceName}</span>
                  </div>
                  <span className={styles.arrow}>→</span>
                  <div className={styles.destinationsList}>
                    <span className={styles.label}>DESTINO(S)</span>
                    <div className={styles.destItems}>
                      {sourceLinks.map((link) => (
                        <div key={link.id} className={styles.destItem}>
                          <div style={{ flex: 1 }}>
                            <span>{link.destinationName}</span>
                            {link.filterRules && Object.keys(link.filterRules).length > 0 && (
                              <div className={styles.filterBadge}>🔍 Filtrado</div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              className="btn-small-danger"
                              onClick={() => handleOpenFilterModal(link)}
                              title="Configurar filtros"
                              style={{ background: 'transparent', color: '#3b82f6', fontSize: '11px' }}
                            >
                              ⚙️
                            </button>
                            <button
                              className="btn-small-danger"
                              onClick={() => handleDeleteLink(link.sourceId, link.destinationId)}
                              title="Remover este destino"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={styles.details}>
                  <small>
                    {sourceLinks.length} destino{sourceLinks.length !== 1 ? 's' : ''} configurado
                    {sourceLinks.length !== 1 ? 's' : ''}
                  </small>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}

export default withAuth(ReceptionLinksPage);
