import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { signIn, getSession } from '../lib/supabase';
import styles from '../styles/Login.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    let active = true;
    const checkSession = async () => {
      try {
        const session = await getSession();
        if (active && session) {
          await router.replace('/dashboard');
        }
      } catch (err) {
        console.error('Session check error:', err);
      }
    };
    void checkSession();
    return () => { active = false; };
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!email.trim()) {
        setError('Email é obrigatório');
        setLoading(false);
        return;
      }

      if (!password) {
        setError('Senha é obrigatória');
        setLoading(false);
        return;
      }

      await signIn(email, password);

      // Verify session exists before redirecting
      const session = await getSession();
      if (session) {
        await router.replace('/dashboard');
      } else {
        setError('Falha ao autenticar. Tente novamente.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao autenticar';

      if (message.includes('Invalid login credentials')) {
        setError('Email ou senha inválido');
      } else if (message.includes('Email not confirmed')) {
        setError('Email não confirmado. Verifique seu email.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isClient) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1>Request Manager</h1>
          <p>Painel Administrativo</p>
        </div>

        <form onSubmit={handleLogin} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              autoFocus
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              placeholder="Sua senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          {(error || router.query.reason === 'session-expired') && (
            <div className={styles.error}>{error || 'Sua sessão foi recusada pela API. Entre novamente.'}</div>
          )}

          <button type="submit" disabled={loading} className={styles.submitButton}>
            {loading ? 'Autenticando...' : 'Entrar'}
          </button>
        </form>

        <div className={styles.footer}>
          <p className={styles.devNote}>
            Autenticação Supabase · Admin único
          </p>
        </div>
      </div>
    </div>
  );
}
