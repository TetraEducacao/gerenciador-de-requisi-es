import React, { useEffect, useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { PageHeader } from '../components/PageHeader';
import { withAuth } from '../lib/withAuth';
import { getDestinations, createDestination, updateDestination, toggleDestination, deleteDestination, Destination, CreateDestinationInput } from '../lib/api';
import styles from '../styles/Destinations.module.css';

function DestinationsPage() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<CreateDestinationInput>>({});

  useEffect(() => {
    fetchDestinations();
  }, []);

  const fetchDestinations = async () => {
    try {
      setLoading(true);
      const data = await getDestinations();
      setDestinations(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load destinations');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Ensure all required fields have values with defaults
      const dataWithDefaults = {
        name: formData.name || '',
        description: formData.description || '',
        url: formData.url || '',
        http_method: formData.http_method || 'POST',
        timeout_ms: formData.timeout_ms || 30000,
        concurrency_limit: formData.concurrency_limit || 1,
        min_interval_ms: formData.min_interval_ms || 0,
        max_attempts: formData.max_attempts || 3,
        rate_limit_value: formData.rate_limit_value,
        rate_limit_unit: formData.rate_limit_unit,
      };

      if (editingId) {
        await updateDestination(editingId, dataWithDefaults);
      } else {
        await createDestination(dataWithDefaults as CreateDestinationInput);
      }
      await fetchDestinations();
      setShowForm(false);
      setEditingId(null);
      setFormData({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save destination');
    }
  };

  const handleEdit = (destination: Destination) => {
    setEditingId(destination.id);
    setFormData(destination);
    setShowForm(true);
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await toggleDestination(id, !enabled);
      await fetchDestinations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle destination');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this destination?')) return;
    try {
      await deleteDestination(id);
      await fetchDestinations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete destination');
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({});
  };

  return (
    <AppLayout>
      <PageHeader
        title="Destinations"
        description="Manage webhook destinations and delivery settings"
        action={
          !showForm && (
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              + New Destination
            </button>
          )
        }
      />

      {error && <div className={styles.errorBanner}>{error}</div>}

      {showForm && (
        <div className={styles.formCard}>
          <h2>{editingId ? 'Edit Destination' : 'New Destination'}</h2>
          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label>Name *</label>
              <input
                type="text"
                required
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Description</label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className={styles.formGroup}>
              <label>URL *</label>
              <input
                type="url"
                required
                value={formData.url || ''}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>HTTP Method *</label>
                <select value={formData.http_method || 'POST'} onChange={(e) => setFormData({ ...formData, http_method: e.target.value })}>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Timeout (ms) *</label>
                <input
                  type="number"
                  required
                  min="1000"
                  max="60000"
                  value={formData.timeout_ms || 30000}
                  onChange={(e) => setFormData({ ...formData, timeout_ms: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Concurrency Limit *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={formData.concurrency_limit || 1}
                  onChange={(e) => setFormData({ ...formData, concurrency_limit: parseInt(e.target.value) })}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Min Interval (ms) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={formData.min_interval_ms || 0}
                  onChange={(e) => setFormData({ ...formData, min_interval_ms: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Max Attempts *</label>
                <input
                  type="number"
                  required
                  min="1"
                  max="10"
                  value={formData.max_attempts || 3}
                  onChange={(e) => setFormData({ ...formData, max_attempts: parseInt(e.target.value) })}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Rate Limit Value</label>
                <input
                  type="number"
                  min="1"
                  value={formData.rate_limit_value || ''}
                  onChange={(e) => setFormData({ ...formData, rate_limit_value: e.target.value ? parseInt(e.target.value) : undefined })}
                />
              </div>
            </div>

            {formData.rate_limit_value && (
              <div className={styles.formGroup}>
                <label>Rate Limit Unit</label>
                <select value={formData.rate_limit_unit || 'second'} onChange={(e) => setFormData({ ...formData, rate_limit_unit: e.target.value })}>
                  <option value="second">Per second</option>
                  <option value="minute">Per minute</option>
                  <option value="hour">Per hour</option>
                </select>
              </div>
            )}

            <div className={styles.formActions}>
              <button type="submit" className="btn-primary">
                {editingId ? 'Update' : 'Create'} Destination
              </button>
              <button type="button" className="btn-secondary" onClick={handleCancel}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className={styles.loadingState}>Loading destinations...</div>
      ) : destinations.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🎯</div>
          <h3>No destinations yet</h3>
          <p>Create your first webhook destination to get started</p>
        </div>
      ) : (
        <div className={styles.destinationsGrid}>
          {destinations.map((dest) => (
            <div key={dest.id} className={styles.destinationCard}>
              <div className={styles.cardHeader}>
                <div>
                  <h3>{dest.name}</h3>
                  {dest.description && <p className={styles.description}>{dest.description}</p>}
                </div>
                <button
                  className={`badge ${dest.enabled ? 'badge-success' : 'badge-error'}`}
                  onClick={() => handleToggle(dest.id, dest.enabled)}
                >
                  {dest.enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div className={styles.cardContent}>
                <div className={styles.urlSection}>
                  <code>{dest.url}</code>
                </div>

                <div className={styles.settingsGrid}>
                  <div className={styles.setting}>
                    <span className={styles.label}>Method</span>
                    <span className={styles.value}>{dest.http_method}</span>
                  </div>
                  <div className={styles.setting}>
                    <span className={styles.label}>Timeout</span>
                    <span className={styles.value}>{dest.timeout_ms}ms</span>
                  </div>
                  <div className={styles.setting}>
                    <span className={styles.label}>Concurrency</span>
                    <span className={styles.value}>{dest.concurrency_limit}</span>
                  </div>
                  <div className={styles.setting}>
                    <span className={styles.label}>Max Attempts</span>
                    <span className={styles.value}>{dest.max_attempts}</span>
                  </div>
                  {dest.rate_limit_value && (
                    <div className={styles.setting}>
                      <span className={styles.label}>Rate Limit</span>
                      <span className={styles.value}>
                        {dest.rate_limit_value}/{dest.rate_limit_unit}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.cardFooter}>
                <small className={styles.timestamp}>
                  Created {new Date(dest.created_at).toLocaleDateString()}
                </small>
                <div className={styles.actions}>
                  <button className="btn-secondary" onClick={() => handleEdit(dest)}>
                    Edit
                  </button>
                  <button className="btn-danger" onClick={() => handleDelete(dest.id)}>
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

export default withAuth(DestinationsPage);
