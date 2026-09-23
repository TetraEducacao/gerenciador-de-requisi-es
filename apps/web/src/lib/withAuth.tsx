/**
 * Higher-order component for protecting authenticated routes
 * Validates Supabase Auth session
 */

import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { getSession } from './supabase';

export function withAuth<P extends object>(
  Component: React.ComponentType<P>
): React.ComponentType<P> {
  return function ProtectedComponent(props: P) {
    const router = useRouter();
    const [isClient, setIsClient] = React.useState(false);
    const [authenticated, setAuthenticated] = React.useState<boolean | null>(null);

    useEffect(() => {
      setIsClient(true);
    }, []);

    useEffect(() => {
      if (!isClient) {
        return;
      }

      let isMounted = true;

      const checkAuth = async () => {
        if (!isMounted) return;

        try {
          const session = await getSession();

          if (!isMounted) return;

          if (session) {
            setAuthenticated(true);
          } else {
            setAuthenticated(false);
            if (router.pathname !== '/login') {
              router.replace('/login');
            }
          }
        } catch (err) {
          console.error('Auth check error:', err);
          if (isMounted) {
            setAuthenticated(false);
            if (router.pathname !== '/login') {
              router.replace('/login');
            }
          }
        }
      };

      checkAuth();

      return () => {
        isMounted = false;
      };
    }, [isClient, router]);

    if (!isClient || authenticated === null) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            backgroundColor: 'var(--color-bg)',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: '14px',
                color: 'var(--color-text-secondary)',
              }}
            >
              Carregando...
            </div>
          </div>
        </div>
      );
    }

    if (!authenticated) {
      return null;
    }

    return <Component {...props} />;
  };
}
