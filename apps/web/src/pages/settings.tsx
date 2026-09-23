import React, { useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { PageHeader } from '../components/PageHeader';
import { withAuth } from '../lib/withAuth';
import styles from '../styles/Settings.module.css';

function SettingsPage() {
  const [settings, setSettings] = useState({
    apiUrl: localStorage.getItem('apiUrl') || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api',
    autoRefresh: localStorage.getItem('autoRefresh') === 'true',
    refreshInterval: parseInt(localStorage.getItem('refreshInterval') || '30', 10),
    theme: localStorage.getItem('theme') || 'light',
  });

  const [saved, setSaved] = useState(false);

  const handleChange = (field: string, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    localStorage.setItem('apiUrl', settings.apiUrl);
    localStorage.setItem('autoRefresh', String(settings.autoRefresh));
    localStorage.setItem('refreshInterval', String(settings.refreshInterval));
    localStorage.setItem('theme', settings.theme);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      localStorage.removeItem('apiUrl');
      localStorage.removeItem('autoRefresh');
      localStorage.removeItem('refreshInterval');
      localStorage.removeItem('theme');
      setSettings({
        apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api',
        autoRefresh: false,
        refreshInterval: 30,
        theme: 'light',
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Settings"
        description="Configure application preferences and behavior"
      />

      {saved && <div className={styles.successBanner}>✓ Settings saved successfully</div>}

      <div className={styles.settingsGrid}>
        {/* API Configuration */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>API Configuration</h2>
            <p>Configure how the dashboard connects to your API</p>
          </div>

          <div className={styles.formGroup}>
            <label>API Base URL</label>
            <input
              type="url"
              value={settings.apiUrl}
              onChange={(e) => handleChange('apiUrl', e.target.value)}
              placeholder="http://localhost:3000/api"
            />
            <small className={styles.helpText}>
              The base URL for API requests. Default: http://localhost:3000/api
            </small>
          </div>
        </div>

        {/* Dashboard Preferences */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Dashboard Preferences</h2>
            <p>Configure dashboard behavior and updates</p>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.autoRefresh}
                onChange={(e) => handleChange('autoRefresh', e.target.checked)}
              />
              Enable auto-refresh
            </label>
            <small className={styles.helpText}>
              Automatically refresh data at set intervals
            </small>
          </div>

          {settings.autoRefresh && (
            <div className={styles.formGroup}>
              <label>Refresh Interval (seconds)</label>
              <input
                type="number"
                min="5"
                max="300"
                value={settings.refreshInterval}
                onChange={(e) => handleChange('refreshInterval', parseInt(e.target.value))}
              />
              <small className={styles.helpText}>
                How often to refresh data (5-300 seconds)
              </small>
            </div>
          )}
        </div>

        {/* Appearance */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Appearance</h2>
            <p>Customize the dashboard look and feel</p>
          </div>

          <div className={styles.formGroup}>
            <label>Theme</label>
            <select value={settings.theme} onChange={(e) => handleChange('theme', e.target.value)}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="auto">Auto (follows system)</option>
            </select>
            <small className={styles.helpText}>
              Choose your preferred color scheme
            </small>
          </div>
        </div>

        {/* Information */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Application Info</h2>
            <p>About this dashboard</p>
          </div>

          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Version</span>
              <span className={styles.infoValue}>0.1.0</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Environment</span>
              <span className={styles.infoValue}>
                {process.env.NODE_ENV === 'production' ? 'Production' : 'Development'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <button className="btn-primary" onClick={handleSave}>
          💾 Save Settings
        </button>
        <button className="btn-secondary" onClick={handleReset}>
          ↺ Reset to Defaults
        </button>
      </div>
    </AppLayout>
  );
}

export default withAuth(SettingsPage);
