'use client';

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { nanoid } from 'nanoid';
import { useStageStore } from '@/lib/store';
import { useCanvasStore } from '@/lib/store/canvas';
import { createStageAPI } from '@/lib/api/stage-api';
import type { PPTElement, PPTTextElement } from '@/lib/types/slides';
import { useI18n } from '@/lib/hooks/use-i18n';

export type DrawingTool = 'pan' | 'pen' | 'rect' | 'circle' | 'text' | 'erase';

export type WhiteboardCanvasHandle = {
  resetView: () => void;
};

type InteractiveWhiteboardCanvasProps = {
  canvasHeight: number;
  canvasWidth: number;
  containerWidth: number;
  containerHeight: number;
  containerScale: number;
  elements: PPTElement[];
  isClearing: boolean;
  onViewModifiedChange?: (modified: boolean) => void;
  readyHintText: string;
  readyText: string;
  activeTool?: DrawingTool;
  activeColor?: string;
  whiteboardId?: string;
  onToolChange?: (tool: DrawingTool) => void;
};

// ─── Per-element interactive renderer ─────────────────────────────────────────
type WhiteboardElementHandle = { startEditing: () => void };

const WhiteboardElement = forwardRef<
  WhiteboardElementHandle,
  {
    element: PPTElement;
    index: number;
    isClearing: boolean;
    totalElements: number;
    activeTool: DrawingTool;
    whiteboardId: string | undefined;
    stageAPI: ReturnType<typeof createStageAPI>;
    effectiveScale: number;
    isSelected: boolean;
    onSelect: (id: string | null) => void;
  }
>(function WhiteboardElement(
  {
    element,
    index,
    isClearing,
    totalElements,
    activeTool,
    whiteboardId,
    stageAPI,
    effectiveScale,
    isSelected,
    onSelect,
  },
  ref,
) {
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const editRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ clientX: 0, clientY: 0, left: 0, top: 0 });
  const elementRef = useRef(element);
  elementRef.current = element;

  const clearDelay = isClearing ? (totalElements - 1 - index) * 0.055 : 0;
  const clearRotate = isClearing ? (index % 2 === 0 ? 1 : -1) * (2 + index * 0.4) : 0;

  const enterEditing = useCallback(() => {
    setIsEditing(true);
    // Focus and select-all in next tick so the contenteditable is mounted
    requestAnimationFrame(() => {
      const el = editRef.current;
      if (!el) return;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
  }, []);

  useImperativeHandle(ref, () => ({ startEditing: enterEditing }), [enterEditing]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isClearing) return;

      // Erase mode: delete this element on click
      if (activeTool === 'erase') {
        e.stopPropagation();
        if (whiteboardId) {
          stageAPI.whiteboard.deleteElement(element.id, whiteboardId);
        }
        return;
      }

      // In other non-pan drawing modes, let events fall through to the canvas
      if (activeTool !== 'pan') return;

      if (isEditing) {
        // Clicks inside the editor stay with the editor – don't start a drag
        return;
      }
      e.stopPropagation();
      onSelect(element.id);
      setIsDragging(true);
      dragStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        left: element.left,
        top: element.top,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [activeTool, isClearing, isEditing, element.id, element.left, element.top, onSelect, whiteboardId, stageAPI],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      const dx = (e.clientX - dragStartRef.current.clientX) / effectiveScale;
      const dy = (e.clientY - dragStartRef.current.clientY) / effectiveScale;
      const updated = {
        ...elementRef.current,
        left: dragStartRef.current.left + dx,
        top: dragStartRef.current.top + dy,
      };
      if (whiteboardId) stageAPI.whiteboard.updateElement(updated, whiteboardId);
    },
    [isDragging, effectiveScale, whiteboardId, stageAPI],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
    setIsDragging(false);
  }, []);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (element.type !== 'text' || isClearing) return;
      e.stopPropagation();
      enterEditing();
    },
    [element.type, isClearing, enterEditing],
  );

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (element.type === 'text' && whiteboardId && editRef.current) {
      const textEl = elementRef.current as PPTTextElement;
      stageAPI.whiteboard.updateElement(
        { ...textEl, content: editRef.current.innerHTML },
        whiteboardId,
      );
    }
  }, [element.type, whiteboardId, stageAPI]);

  // Render helpers
  const renderShape = () => {
    if (element.type !== 'shape') return null;
    const { width, height, viewBox, path, fill, outline } = element;
    const [vbW, vbH] = viewBox;
    const dash =
      outline?.style === 'dashed' ? '8,4' : outline?.style === 'dotted' ? '2,4' : undefined;
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${vbW} ${vbH}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <path
          d={path}
          fill={fill || 'transparent'}
          stroke={outline?.color || '#000'}
          strokeWidth={outline?.width ?? 2}
          strokeDasharray={dash}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  const renderText = () => {
    if (element.type !== 'text') return null;
    const sharedStyle: React.CSSProperties = {
      width: '100%',
      height: '100%',
      padding: '8px',
      color: element.defaultColor,
      fontFamily: element.defaultFontName,
      fontSize: '16px',
      lineHeight: '1.5',
      boxSizing: 'border-box',
    };
    if (isEditing) {
      return (
        <div
          ref={editRef}
          contentEditable
          suppressContentEditableWarning
          onBlur={handleBlur}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ ...sharedStyle, outline: 'none', cursor: 'text', overflow: 'auto' }}
          dangerouslySetInnerHTML={{ __html: element.content }}
        />
      );
    }
    return (
      <div style={{ ...sharedStyle, overflow: 'hidden', userSelect: 'none' }}
        dangerouslySetInnerHTML={{ __html: element.content }}
      />
    );
  };

  const isPanMode = activeTool === 'pan';

  const layoutHeight =
    element.type === 'line'
      ? Math.max(1, Math.abs(element.end[1] - element.start[1]))
      : element.height;

  return (
    <motion.div
      layout={false}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={
        isClearing
          ? { opacity: 0, scale: 0.35, y: -35, rotate: clearRotate,
              transition: { duration: 0.38, delay: clearDelay, ease: [0.5, 0, 1, 0.6] } }
          : { opacity: 1, scale: 1, y: 0, rotate: 0,
              transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: index * 0.03 } }
      }
      exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
      style={{
        position: 'absolute',
        left: element.left,
        top: element.top,
        width: element.width,
        height: layoutHeight,
        outline:
          activeTool === 'erase' && !isClearing
            ? '2px dashed #ef4444'
            : isSelected && !isClearing
              ? '2px solid #9333ea'
              : '2px solid transparent',
        outlineOffset: '3px',
        borderRadius: element.type === 'text' ? '4px' : 2,
        // Always interactive so double-click and erase work regardless of active tool
        pointerEvents: isClearing ? 'none' : 'auto',
        cursor: isEditing
          ? 'text'
          : activeTool === 'erase'
            ? 'pointer'
            : isPanMode
              ? isDragging ? 'grabbing' : 'grab'
              : 'crosshair',
        zIndex: index + 1,
        boxSizing: 'border-box',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onClick={(e) => {
        if (activeTool !== 'pan') return; // don't intercept clicks in draw modes
        e.stopPropagation();
        onSelect(element.id);
      }}
    >
      {renderShape()}
      {renderText()}

      {/* Resize handle (text boxes only, when selected and not editing) */}
      {isSelected && !isClearing && element.type === 'text' && !isEditing && (
        <div
          style={{
            position: 'absolute', bottom: -6, right: -6,
            width: 12, height: 12,
            background: '#9333ea', borderRadius: 2, cursor: 'nwse-resize',
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            const startW = element.width;
            const startH = element.height;
            const startX = e.clientX;
            const startY = e.clientY;
            const onMove = (mv: PointerEvent) => {
              const dw = (mv.clientX - startX) / effectiveScale;
              const dh = (mv.clientY - startY) / effectiveScale;
              if (whiteboardId) {
                const textEl = elementRef.current as PPTTextElement;
                stageAPI.whiteboard.updateElement(
                  {
                    ...textEl,
                    width: Math.max(80, startW + dw),
                    height: Math.max(30, startH + dh),
                  },
                  whiteboardId,
                );
              }
            };
            const onUp = () => {
              window.removeEventListener('pointermove', onMove);
              window.removeEventListener('pointerup', onUp);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
          }}
        />
      )}
    </motion.div>
  );
});

const InteractiveWhiteboardCanvas = forwardRef<
  WhiteboardCanvasHandle,
  InteractiveWhiteboardCanvasProps
>(function InteractiveWhiteboardCanvas(
  {
    canvasHeight,
    canvasWidth,
    containerWidth,
    containerHeight,
    containerScale,
    elements,
    isClearing,
    onViewModifiedChange,
    readyHintText,
    readyText,
    activeTool = 'pan',
    activeColor = '#9333ea',
    whiteboardId,
    onToolChange,
  },
  ref,
) {
  const [viewZoom, setViewZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<{x: number, y: number}[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const prevElementsLengthRef = useRef(elements.length);
  const resetTimerRef = useRef<number | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  // Map of element id → ref for programmatic control (e.g. auto-focus new text boxes)
  const elementRefsMap = useRef<Map<string, WhiteboardElementHandle>>(new Map());
  const stageAPI = createStageAPI(useStageStore);

  const isViewModified = viewZoom !== 1 || panX !== 0 || panY !== 0;

  // Zoom-aware pan boundary: ensure at least an edge of the canvas stays visible
  const clampPan = useCallback(
    (x: number, y: number, zoom: number) => {
      const totalScale = containerScale * zoom;
      const maxPanX = canvasWidth / 2 + containerWidth / (2 * totalScale);
      const maxPanY = canvasHeight / 2 + containerHeight / (2 * totalScale);
      return {
        x: Math.max(-maxPanX, Math.min(maxPanX, x)),
        y: Math.max(-maxPanY, Math.min(maxPanY, y)),
      };
    },
    [canvasWidth, canvasHeight, containerWidth, containerHeight, containerScale],
  );

  const resetView = useCallback((animate: boolean) => {
    setIsPanning(false);
    setIsResetting(animate);
    setViewZoom(1);
    setPanX(0);
    setPanY(0);

    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    if (!animate) {
      return;
    }

    resetTimerRef.current = window.setTimeout(() => {
      setIsResetting(false);
      resetTimerRef.current = null;
    }, 250);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      resetView: () => resetView(true),
    }),
    [resetView],
  );

  // Notify parent when view modified state changes
  useEffect(() => {
    onViewModifiedChange?.(isViewModified);
  }, [isViewModified, onViewModifiedChange]);

  const getCanvasPoint = useCallback((clientX: number, clientY: number) => {
    const el = viewportRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const effectiveScale = Math.max(containerScale * viewZoom, 0.001);
    const canvasScreenX = (containerWidth - canvasWidth * effectiveScale) / 2 + panX * effectiveScale;
    const canvasScreenY = (containerHeight - canvasHeight * effectiveScale) / 2 + panY * effectiveScale;
    
    const x = (clientX - rect.left - canvasScreenX) / effectiveScale;
    const y = (clientY - rect.top - canvasScreenY) / effectiveScale;
    return { x, y };
  }, [containerScale, viewZoom, containerWidth, containerHeight, canvasWidth, canvasHeight, panX, panY]);

  // Always-on drag/pan or drawing based on activeTool
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) {
        return;
      }

      e.preventDefault();
      
      if (activeTool === 'pan') {
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
      } else if (activeTool !== 'erase') {
        // erase is handled per-element; only start a stroke for actual drawing tools
        setIsDrawing(true);
        const pt = getCanvasPoint(e.clientX, e.clientY);
        setCurrentStroke([pt]);
      }
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [panX, panY, activeTool, getCanvasPoint],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isPanning) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        // Convert screen-space drag to canvas-space (accounts for both container scale and zoom)
        const effectiveScale = Math.max(containerScale * viewZoom, 0.001);

        const newPanX = panStartRef.current.panX + dx / effectiveScale;
        const newPanY = panStartRef.current.panY + dy / effectiveScale;
        const clamped = clampPan(newPanX, newPanY, viewZoom);
        setPanX(clamped.x);
        setPanY(clamped.y);
      } else if (isDrawing && activeTool !== 'pan') {
        const pt = getCanvasPoint(e.clientX, e.clientY);
        if (activeTool === 'pen') {
          setCurrentStroke((prev) => [...prev, pt]);
        } else if (activeTool === 'rect' || activeTool === 'circle') {
          setCurrentStroke((prev) => [prev[0], pt]);
        }
      }
    },
    [containerScale, viewZoom, isPanning, clampPan, isDrawing, activeTool, getCanvasPoint],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }

    if (isPanning) {
      setIsPanning(false);
    } else if (isDrawing) {
      setIsDrawing(false);
      const isTextMode = activeTool === 'text';
      if (currentStroke.length > 1 || (isTextMode && currentStroke.length > 0)) {
        let targetWhiteboardId = whiteboardId;
        if (!targetWhiteboardId) {
          const res = stageAPI.whiteboard.get();
          if (res.success && res.data) {
            targetWhiteboardId = res.data.id;
          }
        }

        if (targetWhiteboardId) {
          let newElement: PPTElement | null = null;
          
          if (isTextMode) {
            const pt = currentStroke[0];
            newElement = {
              type: 'text',
              id: nanoid(),
              left: pt.x,
              top: pt.y,
              width: 200,
              height: 50,
              content: '<p>Click to edit text</p>',
              defaultFontName: 'Arial',
              defaultColor: activeColor || '#000000',
              rotate: 0,
            };
          } else {
            const minX = Math.min(...currentStroke.map((p) => p.x));
            const minY = Math.min(...currentStroke.map((p) => p.y));
            const maxX = Math.max(...currentStroke.map((p) => p.x));
            const maxY = Math.max(...currentStroke.map((p) => p.y));
            const width = Math.max(maxX - minX, 1);
            const height = Math.max(maxY - minY, 1);

            if (activeTool === 'pen') {
              const d = currentStroke.reduce((acc, point, i) => {
                const nx = point.x - minX;
                const ny = point.y - minY;
                return i === 0 ? `M ${nx},${ny}` : `${acc} L ${nx},${ny}`;
              }, '');

              newElement = {
                type: 'shape',
                id: nanoid(),
                left: minX,
                top: minY,
                width,
                height,
                viewBox: [width, height],
                path: d,
                fill: 'transparent',
                outline: { color: activeColor, width: 4, style: 'solid' },
                fixedRatio: false,
                rotate: 0,
              };
            } else if (activeTool === 'rect') {
              const d = `M 0,0 L ${width},0 L ${width},${height} L 0,${height} Z`;
              newElement = {
                type: 'shape',
                id: nanoid(),
                left: minX,
                top: minY,
                width,
                height,
                viewBox: [width, height],
                path: d,
                fill: 'transparent',
                outline: { color: activeColor, width: 4, style: 'solid' },
                fixedRatio: false,
                rotate: 0,
              };
            } else if (activeTool === 'circle') {
              const cx = width / 2;
              const ry = height / 2;
              const rx = width / 2;
              const d = `M ${cx},0 A ${rx},${ry} 0 1,1 ${cx},${height} A ${rx},${ry} 0 1,1 ${cx},0`;
              newElement = {
                type: 'shape',
                id: nanoid(),
                left: minX,
                top: minY,
                width,
                height,
                viewBox: [width, height],
                path: d,
                fill: 'transparent',
                outline: { color: activeColor, width: 4, style: 'solid' },
                fixedRatio: false,
                rotate: 0,
              };
            }
          }

          if (newElement) {
            stageAPI.whiteboard.addElement(newElement, targetWhiteboardId);
            // For text: immediately enter edit mode and revert to pan tool
            if (newElement.type === 'text') {
              const newId = newElement.id;
              setSelectedId(newId);
              onToolChange?.('pan');
              // The element ref may not be registered yet — wait one frame
              requestAnimationFrame(() => {
                elementRefsMap.current.get(newId)?.startEditing();
              });
            }
          }
        }
      }
      setCurrentStroke([]);
    }
  }, [isPanning, isDrawing, currentStroke, activeTool, activeColor, whiteboardId, stageAPI, onToolChange]);

  // Zoom toward cursor
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) {
      return;
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (elements.length === 0) {
        return;
      }

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;

      setViewZoom((prevZoom) => {
        const newZoom = Math.min(5, Math.max(0.2, prevZoom * zoomFactor));

        // Adjust pan to keep the point under the cursor stationary
        const rect = el.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;

        const oldScale = containerScale * prevZoom;
        const newScale = containerScale * newZoom;
        const scaleDiff = 1 / newScale - 1 / oldScale;

        setPanX((prevPanX) => {
          const newPanX = prevPanX + (cursorX - containerWidth / 2) * scaleDiff;
          const maxPX = canvasWidth / 2 + containerWidth / (2 * newScale);
          return Math.max(-maxPX, Math.min(maxPX, newPanX));
        });

        setPanY((prevPanY) => {
          const newPanY = prevPanY + (cursorY - containerHeight / 2) * scaleDiff;
          const maxPY = canvasHeight / 2 + containerHeight / (2 * newScale);
          return Math.max(-maxPY, Math.min(maxPY, newPanY));
        });

        return newZoom;
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [elements.length, containerScale, containerWidth, containerHeight, canvasWidth, canvasHeight]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const prevLength = prevElementsLengthRef.current;
    const nextLength = elements.length;
    prevElementsLengthRef.current = nextLength;

    const clearedBoard = prevLength > 0 && nextLength === 0;
    const firstContentLoaded = prevLength === 0 && nextLength > 0;
    if (!clearedBoard && !firstContentLoaded) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        resetView(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [elements.length, resetView]);

  const handleDoubleClick = useCallback(
    (e?: React.MouseEvent) => {
      e?.preventDefault();
      resetView(true);
    },
    [resetView],
  );

  // Canvas position: centered in workspace, offset by pan, scaled by containerScale * viewZoom
  const totalScale = containerScale * viewZoom;
  const canvasScreenX = (containerWidth - canvasWidth * totalScale) / 2 + panX * totalScale;
  const canvasScreenY = (containerHeight - canvasHeight * totalScale) / 2 + panY * totalScale;
  const canvasTransform = `translate(${canvasScreenX}px, ${canvasScreenY}px) scale(${totalScale})`;

  return (
    /* Viewport — fills workspace, handles pointer events, no clipping */
    <div
      ref={viewportRef}
      className="w-full h-full relative select-none"
      style={{
        cursor:
          activeTool === 'pan'
            ? isPanning ? 'grabbing' : 'grab'
            : activeTool === 'text'
              ? 'text'
              : activeTool === 'erase'
                ? 'cell'
                : 'crosshair',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
    >
      {/* Bounded canvas — white background, positioned and scaled. No overflow-hidden so elements can spill into transparent space. */}
      <div
        className="absolute bg-white shadow-2xl rounded-lg border border-gray-200 dark:border-gray-600"
        style={{
          width: canvasWidth,
          height: canvasHeight,
          left: 0,
          top: 0,
          transform: canvasTransform,
          transformOrigin: '0 0',
          transition: isResetting ? 'transform 0.25s ease-out' : undefined,
        }}
      >
        {/* Empty state placeholder */}
        <AnimatePresence>
          {elements.length === 0 && !isClearing && (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                transition: { delay: 0.25, duration: 0.4 },
              }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="text-center text-gray-400">
                <p className="text-lg font-medium">{readyText}</p>
                <p className="text-sm mt-1">{readyHintText}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content layer — elements rendered at their raw coordinates */}
        <div className="absolute inset-0" onClick={() => setSelectedId(null)}>
          <AnimatePresence mode="popLayout">
            {elements.map((element, index) => (
              <WhiteboardElement
                key={element.id}
                ref={(handle) => {
                  if (handle) {
                    elementRefsMap.current.set(element.id, handle);
                  } else {
                    elementRefsMap.current.delete(element.id);
                  }
                }}
                element={element}
                index={index}
                isClearing={isClearing}
                totalElements={elements.length}
                activeTool={activeTool}
                whiteboardId={whiteboardId}
                stageAPI={stageAPI}
                effectiveScale={Math.max(containerScale * viewZoom, 0.001)}
                isSelected={selectedId === element.id}
                onSelect={setSelectedId}
              />
            ))}
          </AnimatePresence>

          {/* Active Drawing Overlay */}
          {isDrawing && currentStroke.length > 0 && (
            <svg
              className="absolute inset-0 pointer-events-none"
              style={{ width: canvasWidth, height: canvasHeight, overflow: 'visible' }}
            >
              {activeTool === 'pen' && (
                <path
                  d={currentStroke.reduce((acc, point, i) => i === 0 ? `M ${point.x},${point.y}` : `${acc} L ${point.x},${point.y}`, '')}
                  fill="none"
                  stroke={activeColor}
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {activeTool === 'rect' && currentStroke.length > 1 && (
                <rect
                  x={Math.min(currentStroke[0].x, currentStroke[1].x)}
                  y={Math.min(currentStroke[0].y, currentStroke[1].y)}
                  width={Math.abs(currentStroke[1].x - currentStroke[0].x)}
                  height={Math.abs(currentStroke[1].y - currentStroke[0].y)}
                  fill="none"
                  stroke={activeColor}
                  strokeWidth={4}
                />
              )}
              {activeTool === 'circle' && currentStroke.length > 1 && (
                <ellipse
                  cx={(currentStroke[0].x + currentStroke[1].x) / 2}
                  cy={(currentStroke[0].y + currentStroke[1].y) / 2}
                  rx={Math.abs(currentStroke[1].x - currentStroke[0].x) / 2}
                  ry={Math.abs(currentStroke[1].y - currentStroke[0].y) / 2}
                  fill="none"
                  stroke={activeColor}
                  strokeWidth={4}
                />
              )}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * Whiteboard canvas with pan, zoom, auto-fit, and bounded viewport.
 */
export type WhiteboardCanvasProps = {
  onViewModifiedChange?: (modified: boolean) => void;
  activeTool?: DrawingTool;
  activeColor?: string;
  onToolChange?: (tool: DrawingTool) => void;
};

export const WhiteboardCanvas = forwardRef<WhiteboardCanvasHandle, WhiteboardCanvasProps>(
  function WhiteboardCanvas({ onViewModifiedChange, activeTool = 'pan', activeColor = '#9333ea', onToolChange }, ref) {
    const { t } = useI18n();
    const stage = useStageStore.use.stage();
    const isClearing = useCanvasStore.use.whiteboardClearing();
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

    const whiteboard = stage?.whiteboard?.[0];
    const rawElements = whiteboard?.elements;
    const elements = useMemo(() => rawElements ?? [], [rawElements]);

    const canvasWidth = 1000;
    const canvasHeight = 562.5;

    const containerScale = useMemo(() => {
      if (containerSize.width === 0 || containerSize.height === 0) return 1;
      return Math.min(containerSize.width / canvasWidth, containerSize.height / canvasHeight);
    }, [containerSize.width, containerSize.height, canvasWidth, canvasHeight]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          setContainerSize({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      });
      observer.observe(container);

      // Initial measurement
      setContainerSize({ width: container.clientWidth, height: container.clientHeight });

      return () => observer.disconnect();
    }, []);

    return (
      <div ref={containerRef} className="w-full h-full overflow-hidden">
        <InteractiveWhiteboardCanvas
          ref={ref}
          canvasHeight={canvasHeight}
          canvasWidth={canvasWidth}
          containerWidth={containerSize.width}
          containerHeight={containerSize.height}
          containerScale={containerScale}
          elements={elements}
          isClearing={isClearing}
          onViewModifiedChange={onViewModifiedChange}
          readyHintText={t('whiteboard.readyHint')}
          readyText={t('whiteboard.ready')}
          activeTool={activeTool}
          activeColor={activeColor}
          whiteboardId={whiteboard?.id}
          onToolChange={onToolChange}
        />
      </div>
    );
  },
);
