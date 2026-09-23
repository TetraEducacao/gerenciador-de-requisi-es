import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { signOut } from '../lib/supabase';
import styles from '../styles/Sidebar.module.css';

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: '📊' },
  { label: 'Requisições', href: '/requests', icon: '📨' },
  { label: 'Recepções', href: '/sources', icon: '🔌' },
  { label: 'Vínculos', href: '/reception-links', icon: '🔗' },
  { label: 'Destinos', href: '/destinations', icon: '🎯' },
  { label: 'Chaves de API', href: '/api-keys', icon: '🔑' },
  { label: 'Configurações', href: '/settings', icon: '⚙️' },
];

interface ServiceStatus {
  name: string;
  status: 'online' | 'degraded' | 'offline';
}

const services: ServiceStatus[] = [
  { name: 'API', status: 'online' },
  { name: 'Redis', status: 'online' },
  { name: 'Worker', status: 'online' },
];

export function Sidebar(): React.ReactElement {
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);

  const isActive = (href: string) => router.pathname === href || router.pathname.startsWith(href + '/');

  const statusColor = (status: string): string => {
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

  const handleLogout = async () => {
    try {
      await signOut();
      router.push('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <>
      <div className={styles.sidebar}>
        <div className={styles.header}>
          <div className={styles.logo}>Request Manager</div>
          <button className={styles.toggleBtn} onClick={() => setExpanded(!expanded)} title={expanded ? 'Collapse' : 'Expand'}>
            {expanded ? '←' : '→'}
          </button>
        </div>

        <nav className={styles.nav}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${isActive(item.href) ? styles.active : ''}`}
            >
              <span className={styles.icon}>{item.icon}</span>
              {expanded && <span className={styles.label}>{item.label}</span>}
            </Link>
          ))}
        </nav>

        <div className={styles.services}>
          <div className={styles.servicesTitle}>{expanded ? 'Status' : '●'}</div>
          {services.map((service) => (
            <div key={service.name} className={styles.service}>
              <div
                className={styles.statusDot}
                style={{ backgroundColor: statusColor(service.status) }}
                title={`${service.name}: ${service.status}`}
              />
              {expanded && <span className={styles.serviceName}>{service.name}</span>}
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          {expanded ? (
            <button className={styles.logoutBtn} onClick={handleLogout} title="Logout">
              🚪 Sair
            </button>
          ) : (
            <button className={styles.logoutBtn} onClick={handleLogout} title="Logout">
              🚪
            </button>
          )}
        </div>
      </div>
    </>
  );
}
