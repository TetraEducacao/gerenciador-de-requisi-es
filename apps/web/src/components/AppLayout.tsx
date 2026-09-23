import React from 'react';
import { Sidebar } from './Sidebar';
import styles from '../styles/AppLayout.module.css';

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  action?: React.ReactNode;
}

export function AppLayout({ children, title, action }: AppLayoutProps): React.ReactElement {
  return (
    <div className={styles.container}>
      <Sidebar />
      <div className={styles.mainContent}>
        {title && (
          <header className={styles.header}>
            <h1>{title}</h1>
            {action && <div className={styles.action}>{action}</div>}
          </header>
        )}
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
