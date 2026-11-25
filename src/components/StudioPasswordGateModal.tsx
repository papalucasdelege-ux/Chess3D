import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck, X } from 'lucide-react';
import {
  fetchStudioAuthStatus,
  setupStudioDeveloperPassword,
  verifyStudioDeveloperPassword,
} from '../chess/angelPortraitVideos';

interface StudioPasswordGateModalProps {
  onAuthenticated: (token: string) => void;
  onClose: () => void;
}

export const StudioPasswordGateModal: React.FC<StudioPasswordGateModalProps> = ({
  onAuthenticated,
  onClose,
}) => {
  const [mode, setMode] = useState<'loading' | 'login' | 'setup' | 'unavailable'>('loading');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    fetchStudioAuthStatus().then((status) => {
      if (!active) return;
      if (!status) {
        setMode('unavailable');
        return;
      }
      setMode(status.configured ? 'login' : 'setup');
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (mode === 'login' || mode === 'setup') {
      window.setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [mode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (mode === 'setup') {
      if (password.length < 6) {
        setError('Developer password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      setSubmitting(true);
      const res = await setupStudioDeveloperPassword(password);
      setSubmitting(false);
      if (res.ok) {
        onAuthenticated(res.token);
      } else {
        setError(res.error);
      }
      return;
    }

    if (mode === 'login') {
      if (!password) {
        setError('Please enter the developer password.');
        return;
      }
      setSubmitting(true);
      const res = await verifyStudioDeveloperPassword(password);
      setSubmitting(false);
      if (res.ok) {
        onAuthenticated(res.token);
      } else {
        setError(res.error);
        setPassword('');
        inputRef.current?.focus();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-security-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-xl border border-[#d6ae63]/35 bg-[#10141c] shadow-2xl overflow-hidden text-[#eef1f6]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-[#151a24]">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#d6ae63]/15 border border-[#d6ae63]/35 text-[#e3be78]">
              {mode === 'setup' ? <ShieldCheck className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </span>
            <div>
              <h2
                id="studio-security-title"
                className="text-sm font-semibold tracking-wide text-[#f3dfb3]"
              >
                {mode === 'setup' ? 'Developer Security Setup' : 'Developer Security Check'}
              </h2>
              <p className="text-[11px] text-white/55">
                Angel Video Studio · Developer Mode Only
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close security screen"
            className="p-1.5 rounded-md text-white/55 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {mode === 'loading' && (
            <div className="py-6 text-center text-xs text-white/60">
              Checking developer security status…
            </div>
          )}

          {mode === 'unavailable' && (
            <div className="space-y-4">
              <p className="text-xs text-white/75 leading-relaxed">
                Developer Studio access is not available in this environment.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-white transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          )}

          {(mode === 'login' || mode === 'setup') && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs text-white/70 leading-relaxed">
                {mode === 'setup'
                  ? 'Set a developer password for this preview session (or configure STUDIO_DEV_PASSWORD in Settings → Secrets).'
                  : 'Enter the developer password to unlock the Angel Video Studio.'}
              </p>

              <div className="space-y-2.5">
                <div>
                  <label
                    htmlFor="studio-dev-password"
                    className="block text-[11px] font-medium text-white/65 mb-1"
                  >
                    Developer Password
                  </label>
                  <div className="relative">
                    <input
                      ref={inputRef}
                      id="studio-dev-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={submitting}
                      placeholder={mode === 'setup' ? 'At least 6 characters' : 'Enter password'}
                      className="w-full rounded-lg bg-[#0a0d13] border border-white/15 focus:border-[#d6ae63]/70 focus:outline-none px-3 py-2 pr-9 text-sm text-white placeholder:text-white/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/45 hover:text-white/80 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {mode === 'setup' && (
                  <div>
                    <label
                      htmlFor="studio-dev-password-confirm"
                      className="block text-[11px] font-medium text-white/65 mb-1"
                    >
                      Confirm Password
                    </label>
                    <input
                      id="studio-dev-password-confirm"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={submitting}
                      placeholder="Re-enter password"
                      className="w-full rounded-lg bg-[#0a0d13] border border-white/15 focus:border-[#d6ae63]/70 focus:outline-none px-3 py-2 text-sm text-white placeholder:text-white/30"
                    />
                  </div>
                )}
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-400/30 bg-red-500/12 px-3 py-2 text-xs text-red-200"
                >
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="px-3.5 py-2 rounded-lg border border-white/12 bg-white/5 hover:bg-white/10 text-xs font-medium text-white/80 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-[#d6ae63] hover:bg-[#e3be78] disabled:opacity-50 text-xs font-semibold text-[#11151d] transition-colors cursor-pointer"
                >
                  {submitting
                    ? 'Verifying…'
                    : mode === 'setup'
                      ? 'Set Password & Open'
                      : 'Unlock Studio'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
