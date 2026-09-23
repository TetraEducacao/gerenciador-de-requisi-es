import React, { useEffect, useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { PageHeader } from '../components/PageHeader';
import { withAuth } from '../lib/withAuth';
import { getDashboardMetrics, getRecentActivity, getHealth, DashboardMetrics, RecentActivity, HealthStatus } from '../lib/api';
import styles from '../styles/Dashboard.module.css';

function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [activity, setActivity] = useState<RecentActivity[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [metricsData, activityData, healthData] = await Promise.all([
          getDashboardMetrics(),
          getRecentActivity(10),
          getHealth(),
        ]);
        setMetrics(metricsData);
        setActivity(activityData);
        setHealth(healthData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
        console.error('Dashboard error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'online':
        return '#10B981';
      case 'degraded':
        return '#F59E0B';
      case 'offline':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  };

  const getStatusBadge = (status: string): string => {
    switch (status) {
      case 'queued':
        return 'badge-info';
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

  return (
    <AppLayout>
      <PageHeader
        title="Dashboard"
        description="Monitor your request processing pipeline"
      />

      {error && (
        <div className={styles.errorBanner}>
          <span>⚠️ {error}</span>
        </div>
      )}

      {/* Health Status Cards */}
      {health && (
        <div className={styles.healthSection}>
          <h2 className={styles.sectionTitle}>System Status</h2>
          <div className={styles.healthGrid}>
            {Object.entries(health).map(([key, status]) => (
              <div key={key} className={styles.healthCard}>
                <div
                  className={styles.statusIndicator}
                  style={{ backgroundColor: getStatusColor(status) }}
                />
                <div>
                  <div className={styles.healthLabel}>{key.toUpperCase()}</div>
                  <div className={styles.healthStatus}>{status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      {loading ? (
        <div className={styles.loadingState}>
          <span>Loading metrics...</span>
        </div>
      ) : metrics ? (
        <div className={styles.metricsSection}>
          <h2 className={styles.sectionTitle}>Request Metrics</h2>
          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricValue}>{metrics.received.toLocaleString()}</div>
              <div className={styles.metricLabel}>Received Total</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricValue}>{metrics.queued}</div>
              <div className={styles.metricLabel}>Queued</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricValue}>{metrics.processing}</div>
              <div className={styles.metricLabel}>Processing</div>
            </div>
            <div className={`${styles.metricCard} ${styles.success}`}>
              <div className={styles.metricValue}>{metrics.succeeded.toLocaleString()}</div>
              <div className={styles.metricLabel}>Succeeded</div>
            </div>
            <div className={`${styles.metricCard} ${styles.error}`}>
              <div className={styles.metricValue}>{metrics.failed.toLocaleString()}</div>
              <div className={styles.metricLabel}>Failed</div>
            </div>
            <div className={`${styles.metricCard} ${styles.warning}`}>
              <div className={styles.metricValue}>{metrics.retrying}</div>
              <div className={styles.metricLabel}>Retrying</div>
            </div>
          </div>
          <div className={styles.lastUpdate}>
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
      ) : null}

      {/* Recent Activity */}
      {activity.length > 0 && (
        <div className={styles.activitySection}>
          <h2 className={styles.sectionTitle}>Recent Activity</h2>
          <div className={styles.activityTable}>
            <div className={styles.tableHeader}>
              <div className={styles.colSource}>Source</div>
              <div className={styles.colDestination}>Destination</div>
              <div className={styles.colStatus}>Status</div>
              <div className={styles.colDuration}>Duration</div>
              <div className={styles.colTime}>Time</div>
            </div>
            {activity.map((item) => (
              <div key={item.id} className={styles.tableRow}>
                <div className={styles.colSource}>{item.source_name}</div>
                <div className={styles.colDestination}>{item.destination_name}</div>
                <div className={styles.colStatus}>
                  <span className={`badge ${getStatusBadge(item.status)}`}>{item.status}</span>
                </div>
                <div className={styles.colDuration}>{item.duration_ms}ms</div>
                <div className={styles.colTime}>{new Date(item.created_at).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppLayout>
  );
}

export default withAuth(DashboardPage);
