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
        {/* Main Info */}
        <div className={styles.card}>
          <h2>Overview</h2>
          <div className={styles.infoGrid}>
            <div className={styles.infoField}>
              <span className={styles.label}>ID</span>
              <code className={styles.value}>{request.id}</code>
            </div>
            <div className={styles.infoField}>
              <span className={styles.label}>Status</span>
              <span className={`badge ${getStatusBadgeClass(request.status)}`}>
                {request.status}
              </span>
            </div>
            <div className={styles.infoField}>
              <span className={styles.label}>Source</span>
              <span className={styles.value}>{request.source_name || 'Unknown'}</span>
            </div>
            <div className={styles.infoField}>
              <span className={styles.label}>Destination</span>
              <span className={styles.value}>{request.destination_name || 'Unknown'}</span>
            </div>
            <div className={styles.infoField}>
              <span className={styles.label}>Total Attempts</span>
              <span className={styles.value}>{request.attempts}</span>
            </div>
            {request.last_http_status && (
              <div className={styles.infoField}>
                <span className={styles.label}>Last HTTP Status</span>
                <span className={styles.value}>{request.last_http_status}</span>
              </div>
            )}
            {request.duration_ms && (
              <div className={styles.infoField}>
                <span className={styles.label}>Duration</span>
                <span className={styles.value}>{request.duration_ms}ms</span>
              </div>
            )}
            <div className={styles.infoField}>
              <span className={styles.label}>Created</span>
              <span className={styles.value}>{new Date(request.created_at).toLocaleString()}</span>
            </div>
            {request.started_at && (
              <div className={styles.infoField}>
                <span className={styles.label}>Started</span>
                <span className={styles.value}>{new Date(request.started_at).toLocaleString()}</span>
              </div>
            )}
            {request.completed_at && (
              <div className={styles.infoField}>
                <span className={styles.label}>Completed</span>
                <span className={styles.value}>{new Date(request.completed_at).toLocaleString()}</span>
              </div>
            )}
            {request.last_error && (
              <div className={styles.infoField}>
                <span className={styles.label}>Last Error</span>
                <span className={styles.errorValue}>{request.last_error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Payload */}
        {request.payload && (
          <div className={styles.card}>
            <h2>Payload</h2>
            <pre className={styles.jsonBlock}>{JSON.stringify(request.payload, null, 2)}</pre>
          </div>
        )}

        {/* Attempts History */}
        {request.attempts_list && request.attempts_list.length > 0 && (
          <div className={styles.card}>
            <h2>Attempt History</h2>
            <div className={styles.attemptsList}>
              {request.attempts_list.map((attempt, index) => (
                <div key={index} className={styles.attemptItem}>
                  <div className={styles.attemptHeader}>
                    <span className={styles.attemptNumber}>Attempt #{attempt.attempt_number}</span>
                    <span className={styles.attemptTime}>
                      {new Date(attempt.started_at).toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.attemptDetails}>
                    {attempt.http_status && (
                      <div>
                        <span className={styles.label}>HTTP Status:</span> {attempt.http_status}
                      </div>
                    )}
                    {attempt.duration_ms && (
                      <div>
                        <span className={styles.label}>Duration:</span> {attempt.duration_ms}ms
                      </div>
                    )}
                    {attempt.completed_at && (
                      <div>
                        <span className={styles.label}>Completed:</span>{' '}
                        {new Date(attempt.completed_at).toLocaleString()}
                      </div>
                    )}
                    {attempt.error_message && (
                      <div className={styles.errorMessage}>
                        <span className={styles.label}>Error:</span> {attempt.error_message}
                      </div>
                    )}
                  </div>
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
