import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { AppLayout } from '../../components/AppLayout';
import { PageHeader } from '../../components/PageHeader';
import { withAuth } from '../../lib/withAuth';
import { getRequestDetail, retryRequest, RequestDetail } from '../../lib/api';
import styles from '../../styles/RequestDetail.module.css';

function RequestDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchRequest();
  }, [id]);

  const fetchRequest = async () => {
    if (typeof id !== 'string') return;
    try {
      setLoading(true);
      const data = await getRequestDetail(id);
      setRequest(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load request');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async () => {
    if (!request?.id) return;
    try {
      await retryRequest(request.id);
      await fetchRequest();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry request');
    }
  };

  const getStatusBadgeClass = (status: string): string => {
    switch (status) {
      case 'queued':
      case 'processing':
        return 'badge-info';
      case 'succeeded':
        return 'badge-success';
      case 'failed':
        return 'badge-error';
      case 'retrying':
        return 'badge-warning';
      default:
        return 'badge-default';
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className={styles.loadingState}>Loading request details...</div>
      </AppLayout>
    );
  }

  if (!request) {
    return (
      <AppLayout>
        <PageHeader title="Request not found" />
        <div className={styles.emptyState}>
          <p>The request you&apos;re looking for doesn&apos;t exist.</p>
          <Link href="/requests" className="btn-primary">
            Back to Requests
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title="Request Details"
        breadcrumbs={[
          { label: 'Requests', href: '/requests' },
          { label: `${request.id.substring(0, 8)}...` },
        ]}
        action={
          request.status === 'failed' && (
            <button className="btn-primary" onClick={handleRetry}>
              🔄 Retry
            </button>
          )
        }
      />

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.detailsGrid}>
        {/* Status Overview */}
        <div className={styles.card}>
          <h2>📊 Status Overview</h2>
          <div className={styles.infoGrid}>
            <div className={styles.infoField}>
              <span className={styles.label}>Request ID</span>
              <code className={styles.value} style={{ fontSize: '11px' }}>{request.id}</code>
            </div>
            <div className={styles.infoField}>
              <span className={styles.label}>Status</span>
              <span className={`badge ${getStatusBadgeClass(request.status)}`}>
                {request.status.toUpperCase()}
              </span>
            </div>
            <div className={styles.infoField}>
              <span className={styles.label}>Total Attempts</span>
              <span className={styles.value}>{request.attempts}</span>
            </div>
            {request.last_http_status && (
              <div className={styles.infoField}>
                <span className={styles.label}>Last HTTP Response</span>
                <span style={{
                  backgroundColor: request.last_http_status >= 200 && request.last_http_status < 300 ? '#ECFDF5' : '#FEF2F2',
                  color: request.last_http_status >= 200 && request.last_http_status < 300 ? '#065F46' : '#991B1B',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}>
                  {request.last_http_status}
                </span>
              </div>
            )}
            {request.duration_ms && (
              <div className={styles.infoField}>
                <span className={styles.label}>Total Duration</span>
                <span className={styles.value}>{request.duration_ms}ms</span>
              </div>
            )}
          </div>
        </div>

        {/* Timeline */}
        <div className={styles.card}>
          <h2>⏱️ Timeline</h2>
          <div className={styles.infoGrid}>
            <div className={styles.infoField}>
              <span className={styles.label}>Created At</span>
              <span className={styles.value}>{new Date(request.created_at).toLocaleString('pt-BR')}</span>
            </div>
            {request.started_at && (
              <div className={styles.infoField}>
                <span className={styles.label}>Started At</span>
                <span className={styles.value}>{new Date(request.started_at).toLocaleString('pt-BR')}</span>
              </div>
            )}
            {request.completed_at && (
              <div className={styles.infoField}>
                <span className={styles.label}>Completed At</span>
                <span className={styles.value}>{new Date(request.completed_at).toLocaleString('pt-BR')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Source & Destination */}
        <div className={styles.card}>
          <h2>🔄 Fluxo (Source → Destination)</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '20px', alignItems: 'stretch' }}>
            <div style={{ padding: '15px', backgroundColor: '#F3F4F6', borderRadius: '4px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '10px', fontSize: '14px' }}>📥 Recepção (Source)</h3>
              <div className={styles.infoGrid}>
                <div>
                  <small style={{ color: '#666' }}>Nome</small>
                  <p style={{ marginTop: '3px', fontSize: '12px', fontWeight: '500' }}>{request.source_name || 'Desconhecido'}</p>
                </div>
                <div>
                  <small style={{ color: '#666' }}>ID</small>
                  <code style={{ marginTop: '3px', fontSize: '10px', display: 'block', wordBreak: 'break-all' }}>{request.source_id}</code>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: '28px' }}>→</div>
            </div>
            <div style={{ padding: '15px', backgroundColor: '#F3F4F6', borderRadius: '4px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '10px', fontSize: '14px' }}>📤 Destino (Destination)</h3>
              <div className={styles.infoGrid}>
                <div>
                  <small style={{ color: '#666' }}>Nome</small>
                  <p style={{ marginTop: '3px', fontSize: '12px', fontWeight: '500' }}>{request.destination_name || 'Desconhecido'}</p>
                </div>
                <div>
                  <small style={{ color: '#666' }}>ID</small>
                  <code style={{ marginTop: '3px', fontSize: '10px', display: 'block', wordBreak: 'break-all' }}>{request.destination_id}</code>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Error Details */}
        {request.last_error && (
          <div className={styles.card} style={{ borderLeft: '4px solid #EF4444' }}>
            <h2>❌ Erro Encontrado</h2>
            <p style={{ color: '#EF4444', fontSize: '13px', margin: '10px 0' }}>{request.last_error}</p>
          </div>
        )}

        {/* Payload */}
        {request.payload && (
          <div className={styles.card}>
            <h2>📦 Payload Recebido</h2>
            <pre className={styles.jsonBlock} style={{ maxHeight: '400px', overflow: 'auto' }}>{JSON.stringify(request.payload, null, 2)}</pre>
          </div>
        )}

        {/* Attempts History */}
        {request.attempts_list && request.attempts_list.length > 0 && (
          <div className={styles.card}>
            <h2>📋 Histórico de Tentativas ({request.attempts_list.length})</h2>
            <div className={styles.attemptsList}>
              {request.attempts_list.map((attempt, index) => (
                <div key={index} className={styles.attemptItem} style={{ marginBottom: '15px', paddingBottom: '15px', borderBottom: '1px solid #e0e0e0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <strong style={{ fontSize: '13px' }}>Tentativa #{attempt.attempt_number}</strong>
                    {attempt.http_status && (
                      <span style={{
                        backgroundColor: attempt.http_status >= 200 && attempt.http_status < 300 ? '#ECFDF5' : '#FEF2F2',
                        color: attempt.http_status >= 200 && attempt.http_status < 300 ? '#065F46' : '#991B1B',
                        padding: '4px 12px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 'bold'
                      }}>
                        HTTP {attempt.http_status}
                      </span>
                    )}
                  </div>
                  <div className={styles.infoGrid} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    <div>
                      <small style={{ color: '#666' }}>Iniciado</small>
                      <p style={{ marginTop: '3px', fontSize: '11px' }}>{new Date(attempt.started_at).toLocaleString('pt-BR')}</p>
                    </div>
                    <div>
                      <small style={{ color: '#666' }}>Concluído</small>
                      <p style={{ marginTop: '3px', fontSize: '11px' }}>{new Date(attempt.completed_at).toLocaleString('pt-BR')}</p>
                    </div>
                    <div>
                      <small style={{ color: '#666' }}>Duração</small>
                      <p style={{ marginTop: '3px', fontSize: '11px', fontWeight: '500' }}>{attempt.duration_ms}ms</p>
                    </div>
                  </div>
                  {attempt.error_message && (
                    <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#FEF2F2', borderRadius: '3px', fontSize: '11px', color: '#991B1B' }}>
                      <strong>Erro:</strong> {attempt.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default withAuth(RequestDetailPage);
