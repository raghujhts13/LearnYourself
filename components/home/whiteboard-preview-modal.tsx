'use client';

/**
 * WhiteboardPreviewModal
 *
 * Read-only modal that displays a saved whiteboard snapshot from a class session.
 * Renders the elements using a scaled-down canvas preview via CSS transform.
 */

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, PencilLine } from 'lucide-react';

interface WhiteboardPreviewModalProps {
  open: boolean;
  onClose: () => void;
  stageName: string;
  whiteboardData: string;
}

export function WhiteboardPreviewModal({
  open,
  onClose,
  stageName,
  whiteboardData,
}: WhiteboardPreviewModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Render whiteboard elements onto canvas
  useEffect(() => {
    if (!open || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let elements: Array<{
      type: string;
      left?: number;
      top?: number;
      width?: number;
      height?: number;
      content?: string;
      color?: string;
      strokeColor?: string;
      points?: Array<{ x: number; y: number }>;
    }> = [];

    try {
      const parsed = JSON.parse(whiteboardData);
      if (Array.isArray(parsed)) {
        elements = parsed[0]?.elements ?? parsed;
      }
    } catch {
      return;
    }

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const el of elements) {
      ctx.save();
      if (el.type === 'text' && el.left != null && el.top != null) {
        ctx.font = '12px sans-serif';
        ctx.fillStyle = el.color ?? '#333';
        ctx.fillText(el.content ?? '', el.left * 0.3, el.top * 0.3 + 12);
      } else if (el.type === 'shape' && el.left != null && el.top != null) {
        ctx.strokeStyle = el.strokeColor ?? '#7c3aed';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(el.left * 0.3, el.top * 0.3, (el.width ?? 40) * 0.3, (el.height ?? 40) * 0.3);
      } else if (el.type === 'line' && Array.isArray(el.points) && el.points.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = el.strokeColor ?? el.color ?? '#7c3aed';
        ctx.lineWidth = 1.5;
        ctx.moveTo(el.points[0].x * 0.3, el.points[0].y * 0.3);
        for (let i = 1; i < el.points.length; i++) {
          ctx.lineTo(el.points[i].x * 0.3, el.points[i].y * 0.3);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [open, whiteboardData]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="wb-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            key="wb-modal"
            initial={{ opacity: 0, scale: 0.93 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.93 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-[5%] z-[71] flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <PencilLine className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 dark:text-white text-sm">{stageName}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">Saved whiteboard</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Canvas */}
            <div className="flex-1 overflow-auto p-4 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#374151_1px,transparent_1px)] [background-size:20px_20px] flex items-start justify-center">
              <canvas
                ref={canvasRef}
                width={900}
                height={600}
                className="rounded-xl shadow-md bg-white max-w-full"
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
