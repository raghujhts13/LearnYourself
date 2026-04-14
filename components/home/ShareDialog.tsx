'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Globe, Share2, EyeOff, Check, Link, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { publishSession, unpublishSession } from '@/lib/utils/session-publish';
import { toast } from 'sonner';
import { createLogger } from '@/lib/logger';

const log = createLogger('ShareDialog');

interface ServerInfo {
  url: string;
  isLocal: boolean;
  isTunneled: boolean;
  provider: string;
  vercelDeployConfigured?: boolean;
}

interface ShareDialogProps {
  stageId: string | null;
  publishedUrl?: string | null;
  onClose: () => void;
  onPublished: () => void;
}

export function ShareDialog({ stageId, publishedUrl, onClose, onPublished }: ShareDialogProps) {
  const [shareTarget, setShareTarget] = useState<'local' | 'vercel' | 'custom'>('local');
  const [includeMedia, setIncludeMedia] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(publishedUrl ?? null);
  const [copiedStudent, setCopiedStudent] = useState(false);
  const [copiedProfessor, setCopiedProfessor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [showManualUrl, setShowManualUrl] = useState(false);

  const isOpen = stageId !== null;

  useEffect(() => {
    if (!isOpen) return;
    setShareUrl(publishedUrl ?? null);
    setError(null);
    setCopiedStudent(false);
    setCopiedProfessor(false);
    setShareTarget(
      publishedUrl?.includes('.vercel.app') && publishedUrl.includes('/learn/')
        ? 'vercel'
        : 'local',
    );
    setServerInfo(null);
    setManualUrl('');
    setShowManualUrl(false);
    setServerLoading(true);
    fetch('/api/public-url')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setServerInfo({
            url: data.url,
            isLocal: data.isLocal,
            isTunneled: data.isTunneled,
            provider: data.provider,
            vercelDeployConfigured: data.vercelDeployConfigured,
          });
          setManualUrl(data.url);
        }
      })
      .catch(() => {})
      .finally(() => setServerLoading(false));
  }, [isOpen, stageId]);

  const studentUrl = shareUrl
    ? shareUrl.includes('/learn/')
      ? shareUrl
      : shareUrl.replace('/classroom/', '/learn/')
    : null;
  const professorUrl = shareUrl && !shareUrl.includes('/learn/') ? shareUrl : null;

  const publishDisabled =
    publishing ||
    (shareTarget === 'vercel' && (serverLoading || !serverInfo?.vercelDeployConfigured));

  const handlePublish = async () => {
    if (!stageId) return;
    setPublishing(true);
    setError(null);
    try {
      if (shareTarget === 'custom' && !manualUrl.trim()) {
        setError('Enter your public base URL (e.g. https://your-server.com)');
        return;
      }
      if (shareTarget === 'vercel' && !serverInfo?.vercelDeployConfigured) {
        setError('Add VERCEL_TOKEN to .env.local on this LYS server, restart, then try again.');
        return;
      }
      const baseUrlOverride =
        shareTarget === 'custom'
          ? manualUrl.trim()
          : shareTarget === 'local' && showManualUrl && manualUrl.trim()
            ? manualUrl.trim()
            : undefined;

      const result = await publishSession(stageId, {
        includeMedia,
        baseUrlOverride,
        shareTarget,
      });
      setShareUrl(result.url);
      onPublished();
      toast.success(
        shareTarget === 'vercel'
          ? 'Deployed to Vercel — share the student link below'
          : 'Classroom published successfully',
      );
    } catch (err) {
      log.error('Failed to publish:', err);
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!stageId) return;
    setPublishing(true);
    setError(null);
    try {
      await unpublishSession(stageId);
      setShareUrl(null);
      onPublished();
      toast.success('Classroom unpublished');
    } catch (err) {
      log.error('Failed to unpublish:', err);
      setError(err instanceof Error ? err.message : 'Unpublish failed');
    } finally {
      setPublishing(false);
    }
  };

  const handleCopyStudent = () => {
    if (!studentUrl) return;
    navigator.clipboard.writeText(studentUrl).then(() => {
      setCopiedStudent(true);
      setTimeout(() => setCopiedStudent(false), 2000);
    });
  };

  const handleCopyProfessor = () => {
    if (!professorUrl) return;
    navigator.clipboard.writeText(professorUrl).then(() => {
      setCopiedProfessor(true);
      setTimeout(() => setCopiedProfessor(false), 2000);
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-xl bg-violet-100 dark:bg-violet-900/30">
                <Globe className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  Share Classroom
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Anyone with the link can view this classroom
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Share target selector */}
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Share via</p>
              <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 p-0.5 bg-gray-50/80 dark:bg-gray-800/50">
                {(
                  [
                    { id: 'local' as const, label: 'Local server' },
                    { id: 'vercel' as const, label: 'Vercel' },
                    { id: 'custom' as const, label: 'Custom URL' },
                  ] as const
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setShareTarget(id);
                      if (id === 'custom') setShowManualUrl(true);
                    }}
                    className={cn(
                      'flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-colors',
                      shareTarget === id
                        ? 'bg-white dark:bg-gray-700 text-violet-700 dark:text-violet-300 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Vercel info panel */}
            {shareTarget === 'vercel' && (
              <div className="mb-4 p-3 rounded-xl border bg-violet-50/60 dark:bg-violet-950/30 border-violet-200/60 dark:border-violet-800/40 text-xs text-violet-900 dark:text-violet-100">
                <p className="font-semibold mb-1">Standalone site on Vercel</p>
                <p className="text-violet-800/90 dark:text-violet-200/85 leading-relaxed">
                  Uploads this class and deploys a new production URL with only the student view.
                  Your LYS server must have{' '}
                  <code className="px-1 py-0.5 rounded bg-violet-100/80 dark:bg-violet-900/50 font-mono text-[10px]">
                    VERCEL_TOKEN
                  </code>{' '}
                  in{' '}
                  <code className="px-1 py-0.5 rounded bg-violet-100/80 dark:bg-violet-900/50 font-mono text-[10px]">
                    .env.local
                  </code>{' '}
                  (create a token under Vercel → Settings → Tokens).
                </p>
                {!serverLoading && serverInfo && !serverInfo.vercelDeployConfigured && (
                  <p className="mt-2 font-medium text-amber-800 dark:text-amber-200">
                    VERCEL_TOKEN is not detected on this server — add it and restart before publishing.
                  </p>
                )}
              </div>
            )}

            {/* Local / Custom server URL status */}
            {(shareTarget === 'local' || shareTarget === 'custom') && (
              <div className="mb-4 p-3 rounded-xl border bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
                {serverLoading ? (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Detecting server URL…
                  </div>
                ) : serverInfo ? (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      {serverInfo.isLocal ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                          Local only
                        </span>
                      ) : serverInfo.isTunneled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                          Tunneled ({serverInfo.provider.replace('tunnel-', '')})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          {serverInfo.provider === 'vercel'
                            ? 'Vercel'
                            : serverInfo.provider === 'railway'
                              ? 'Railway'
                              : serverInfo.provider === 'fly'
                                ? 'Fly.io'
                                : serverInfo.provider === 'render'
                                  ? 'Render'
                                  : serverInfo.provider === 'manual'
                                    ? 'Custom URL'
                                    : 'Cloud hosted'}
                        </span>
                      )}
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1 min-w-0">
                        {serverInfo.url}
                      </span>
                    </div>

                    {serverInfo.isLocal && (
                      <div className="mb-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200/60 dark:border-orange-700/40 px-3 py-2 text-xs text-orange-700 dark:text-orange-300">
                        <strong>This URL only works on your device.</strong> To share with others,
                        set a tunnel or enter your server&apos;s public IP/domain below.
                        {!showManualUrl && (
                          <button
                            type="button"
                            onClick={() => setShowManualUrl(true)}
                            className="ml-2 underline font-semibold"
                          >
                            Set public URL
                          </button>
                        )}
                      </div>
                    )}

                    {serverInfo.isTunneled && (
                      <p className="text-xs text-yellow-600 dark:text-yellow-400">
                        Tunnel URL changes on restart — shared links may break when the server stops.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-500">Could not detect server URL.</p>
                )}

                {(showManualUrl || shareTarget === 'custom') && (
                  <div className="mt-2">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                      {shareTarget === 'custom'
                        ? 'Public base URL for this LYS server (required)'
                        : "Your server's public URL (e.g. https://192.168.1.5:3000 or https://myclassroom.com)"}
                    </label>
                    <input
                      type="url"
                      value={manualUrl}
                      onChange={(e) => setManualUrl(e.target.value)}
                      placeholder="https://your-server.com"
                      className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-300"
                    />
                  </div>
                )}
                {!showManualUrl && !serverInfo?.isLocal && shareTarget !== 'custom' && (
                  <button
                    type="button"
                    onClick={() => setShowManualUrl(true)}
                    className="mt-1.5 text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
                  >
                    Use a different URL
                  </button>
                )}
              </div>
            )}

            {/* Published links */}
            {shareUrl && (
              <div className="mb-4 space-y-3">
                <div className="p-3 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200/60 dark:border-violet-700/40">
                  <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 mb-1.5 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" />
                    Student link
                    <span className="ml-auto font-normal text-[10px] text-violet-500 dark:text-violet-400">
                      Share this with your students
                    </span>
                  </p>
                  <p className="text-[11px] text-violet-600/70 dark:text-violet-400/70 mb-2">
                    Students get a read-only view. No editing, no exports.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={studentUrl ?? ''}
                      className="flex-1 min-w-0 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-700 dark:text-gray-300 outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopyStudent}
                      className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-colors"
                    >
                      {copiedStudent ? <Check className="w-3.5 h-3.5" /> : <Link className="w-3.5 h-3.5" />}
                      {copiedStudent ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                <details className="group">
                  <summary className="text-[11px] text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300 select-none list-none flex items-center gap-1">
                    <span className="group-open:hidden">▶</span>
                    <span className="hidden group-open:inline">▼</span>
                    Your own access link (professor view)
                  </summary>
                  {professorUrl ? (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={professorUrl}
                        className="flex-1 min-w-0 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-700 dark:text-gray-300 outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleCopyProfessor}
                        className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs font-semibold transition-colors"
                      >
                        {copiedProfessor ? <Check className="w-3.5 h-3.5" /> : <Link className="w-3.5 h-3.5" />}
                        {copiedProfessor ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                      This Vercel deployment only includes the student experience. Open this classroom
                      in your local LYS app to edit or present from the professor view.
                    </p>
                  )}
                </details>
              </div>
            )}

            {/* Include media toggle */}
            <label className="flex items-center gap-3 mb-4 cursor-pointer">
              <div
                onClick={() => setIncludeMedia(!includeMedia)}
                className={`relative w-9 h-5 rounded-full transition-colors ${includeMedia ? 'bg-violet-600' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <div
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${includeMedia ? 'translate-x-4' : ''}`}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  Include audio &amp; media
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Visitors hear TTS narration and see generated images
                </p>
              </div>
            </label>

            {error && <p className="mb-3 text-xs text-red-500 dark:text-red-400">{error}</p>}

            {/* Action buttons */}
            <div className="flex gap-2">
              {shareUrl ? (
                <>
                  <button
                    type="button"
                    onClick={handleUnpublish}
                    disabled={publishing}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
                  >
                    {publishing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <EyeOff className="w-4 h-4" />
                    )}
                    Unpublish
                  </button>
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={publishDisabled}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                  >
                    {publishing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Share2 className="w-4 h-4" />
                    )}
                    {publishing ? 'Publishing…' : 'Re-publish'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={publishDisabled}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                  >
                    {publishing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Globe className="w-4 h-4" />
                    )}
                    {publishing
                      ? 'Publishing…'
                      : shareTarget === 'vercel'
                        ? 'Deploy to Vercel'
                        : 'Publish & Get Link'}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
