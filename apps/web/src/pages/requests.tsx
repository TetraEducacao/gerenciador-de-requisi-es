import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppLayout } from '../components/AppLayout';
import { PageHeader } from '../components/PageHeader';
import { withAuth } from '../lib/withAuth';
import { getRequests, Request } from '../lib/api';
import styles from '../styles/Requests.module.css';

const STATUS_OPTIONS = ['', 'queued', 'processing', 'succeeded', 'failed', 'retrying'];

function RequestsPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    fetchRequests();
  }, [statusFilter, offset]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const data = await getRequests({
        status: statusFilter || undefined,
        limit,
        offset,
      });
      setRequests(data.data);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requests');
      console.error('Error:', err);
    } finally {
      setLoading(false);
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

  const totalPages = Math.ceil(total / limit) || 1;
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <AppLayout>
      <PageHeader
        title="Requests"
        description="Monitor and manage webhook requests"
      />

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <label>Status</label>
          <select value={statusFilter} onChange={(e) => {
            setStatusFilter(e.target.value);
            setOffset(0);
          }}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.filter(s => s).map(status => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className={styles.loadingState}>Loading requests...</div>
      ) : requests.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📨</div>
          <h3>No requests found</h3>
          <p>
            {statusFilter ? 'Try adjusting your filters' : 'Create some requests to get started'}
          </p>
        </div>
      ) : (
        <>
          <div className={styles.requestsTable}>
            <div className={styles.tableHeader}>
              <div className={styles.colId}>ID</div>
              <div className={styles.colSource}>Source</div>
              <div className={styles.colDestination}>Destination</div>
              <div className={styles.colStatus}>Status</div>
              <div className={styles.colAttempts}>Attempts</div>
              <div className={styles.colTime}>Created</div>
            </div>

            {requests.map((request) => (
              <Link
                key={request.id}
                href={`/requests/${request.id}`}
                className={styles.tableRow}
              >
                <div className={styles.colId}>
                  <code>{request.id.substring(0, 8)}...</code>
                </div>
                <div className={styles.colSource}>{request.source_name || 'Unknown'}</div>
                <div className={styles.colDestination}>{request.destination_name || 'Unknown'}</div>
                <div className={styles.colStatus}>
                  <span className={`badge ${getStatusBadgeClass(request.status)}`}>
                    {request.status}
                  </span>
                </div>
                <div className={styles.colAttempts}>{request.attempts}</div>
                <div className={styles.colTime}>
                  {new Date(request.created_at).toLocaleString()}
                </div>
              </Link>
            ))}
          </div>

          <div className={styles.pagination}>
            <span className={styles.pageInfo}>
              Showing {offset + 1}-{Math.min(offset + limit, total)} of {total} requests
            </span>
            <div className={styles.pageButtons}>
              <button
                className="btn-secondary"
                disabled={currentPage === 1}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                ← Previous
              </button>
              <span className={styles.pageNumber}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                className="btn-secondary"
                disabled={currentPage === totalPages}
                onClick={() => setOffset(offset + limit)}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </AppLayout>
  );
}

export default withAuth(RequestsPage);
