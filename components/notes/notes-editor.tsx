'use client';

/**
 * NotesEditor
 *
 * ProseMirror-based rich text editor for human-authored class notes.
 * Supports: bold, italic, underline, links, bullet/ordered lists,
 *           headings (h2/h3), inline images (file upload + clipboard paste).
 *
 * Uses only packages already installed in this project.
 */

import { useEffect, useRef, useCallback } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { addListNodes, wrapInList } from 'prosemirror-schema-list';
import { toggleMark, setBlockType, baseKeymap } from 'prosemirror-commands';
import { undo, redo, history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { cn } from '@/lib/utils';
import {
  Bold,
  Italic,
  Underline,
  Link,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ImagePlus,
  Undo2,
  Redo2,
} from 'lucide-react';

// ─── Schema ──────────────────────────────────────────────────────────────────

const nodes = addListNodes(
  basicSchema.spec.nodes as Parameters<typeof addListNodes>[0],
  'paragraph block*',
  'block',
).append({
  image: {
    inline: true,
    attrs: { src: {}, alt: { default: '' }, title: { default: '' } },
    group: 'inline',
    draggable: true,
    parseDOM: [
      {
        tag: 'img[src]',
        getAttrs(dom) {
          const el = dom as HTMLElement;
          return {
            src: el.getAttribute('src'),
            alt: el.getAttribute('alt') || '',
            title: el.getAttribute('title') || '',
          };
        },
      },
    ],
    toDOM(node) {
      return ['img', { src: node.attrs.src, alt: node.attrs.alt, class: 'notes-inline-img' }];
    },
  },
});

const marks = basicSchema.spec.marks.append({
  underline: {
    parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
    toDOM() {
      return ['u', 0];
    },
  },
  link: {
    attrs: { href: {}, title: { default: null } },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs(dom) {
          const el = dom as HTMLElement;
          return { href: el.getAttribute('href'), title: el.getAttribute('title') };
        },
      },
    ],
    toDOM(node) {
      return ['a', { href: node.attrs.href, title: node.attrs.title, target: '_blank', rel: 'noopener noreferrer' }, 0];
    },
  },
});

export const notesSchema = new Schema({ nodes, marks });

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function emptyDoc(): object {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

function docFromJSON(json: string): ReturnType<typeof notesSchema.nodeFromJSON> | null {
  try {
    return notesSchema.nodeFromJSON(JSON.parse(json));
  } catch {
    return null;
  }
}

function insertImage(view: EditorView, src: string) {
  const { state, dispatch } = view;
  const imageType = state.schema.nodes.image;
  if (!imageType) return;
  const node = imageType.create({ src });
  const tr = state.tr.replaceSelectionWith(node);
  dispatch(tr);
  view.focus();
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface NotesEditorProps {
  value: string;
  onChange: (docJSON: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotesEditor({
  value,
  onChange,
  readOnly = false,
  placeholder = 'Start writing your notes…',
  className,
}: NotesEditorProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Initialise editor once
  useEffect(() => {
    if (!mountRef.current) return;

    const doc = value ? (docFromJSON(value) ?? notesSchema.nodeFromJSON(emptyDoc())) : notesSchema.nodeFromJSON(emptyDoc());

    const notesKeymap = keymap({
      'Mod-z': undo,
      'Mod-y': redo,
      'Shift-Mod-z': redo,
      'Mod-b': toggleMark(notesSchema.marks.strong),
      'Mod-i': toggleMark(notesSchema.marks.em),
      'Mod-u': toggleMark(notesSchema.marks.underline),
      ...baseKeymap,
    });

    const state = EditorState.create({
      doc,
      plugins: [history(), notesKeymap, dropCursor(), gapCursor()],
    });

    const view = new EditorView(mountRef.current, {
      state,
      editable: () => !readOnly,
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr);
        view.updateState(newState);
        if (tr.docChanged) {
          onChangeRef.current(JSON.stringify(newState.doc.toJSON()));
        }
      },
      handlePaste(view, event) {
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageItem = items.find((i) => i.type.startsWith('image/'));
        if (!imageItem) return false;
        event.preventDefault();
        const file = imageItem.getAsFile();
        if (!file) return false;
        readFileAsDataURL(file).then((src) => insertImage(view, src));
        return true;
      },
      handleDrop(view, event) {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
          f.type.startsWith('image/'),
        );
        if (files.length === 0) return false;
        event.preventDefault();
        files.forEach((f) => readFileAsDataURL(f).then((src) => insertImage(view, src)));
        return true;
      },
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount once

  // Sync external value changes (e.g. switching between stages in journal)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentJSON = JSON.stringify(view.state.doc.toJSON());
    if (currentJSON === value) return;
    const doc = value ? (docFromJSON(value) ?? notesSchema.nodeFromJSON(emptyDoc())) : notesSchema.nodeFromJSON(emptyDoc());
    const newState = EditorState.create({ doc, plugins: view.state.plugins });
    view.updateState(newState);
  }, [value]);

  // Sync readOnly
  useEffect(() => {
    viewRef.current?.setProps({ editable: () => !readOnly });
  }, [readOnly]);

  // ── Toolbar commands ──
  const exec = useCallback(
    (cmd: (state: EditorState, dispatch?: EditorView['dispatch']) => boolean) => {
      const view = viewRef.current;
      if (!view) return;
      cmd(view.state, view.dispatch);
      view.focus();
    },
    [],
  );

  const isActive = useCallback((markType: string) => {
    const view = viewRef.current;
    if (!view) return false;
    const { from, $from, to, empty } = view.state.selection;
    const type = notesSchema.marks[markType];
    if (!type) return false;
    if (empty) return !!type.isInSet(view.state.storedMarks || $from.marks());
    return view.state.doc.rangeHasMark(from, to, type);
  }, []);

  const insertLink = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const url = window.prompt('Enter URL:');
    if (!url) return;
    const linkMark = notesSchema.marks.link;
    if (!linkMark) return;
    const { from, to } = view.state.selection;
    const tr = view.state.tr.addMark(from, to, linkMark.create({ href: url }));
    view.dispatch(tr);
    view.focus();
  }, []);

  const handleImageUpload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !viewRef.current) return;
      const src = await readFileAsDataURL(file);
      insertImage(viewRef.current, src);
    };
    input.click();
  }, []);

  const toolbarBtn = (
    onClick: () => void,
    icon: React.ReactNode,
    title: string,
    active = false,
  ) => (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      className={cn(
        'p-1.5 rounded-md transition-colors text-sm',
        active
          ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400'
          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200',
        readOnly && 'opacity-40 pointer-events-none',
      )}
    >
      {icon}
    </button>
  );

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex items-center gap-0.5 px-2 py-1 border-b border-gray-200 dark:border-gray-700 flex-wrap shrink-0 bg-gray-50 dark:bg-gray-800/50">
          {toolbarBtn(() => exec(undo), <Undo2 className="w-3.5 h-3.5" />, 'Undo')}
          {toolbarBtn(() => exec(redo), <Redo2 className="w-3.5 h-3.5" />, 'Redo')}
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
          {toolbarBtn(
            () => exec(toggleMark(notesSchema.marks.strong)),
            <Bold className="w-3.5 h-3.5" />,
            'Bold',
            isActive('strong'),
          )}
          {toolbarBtn(
            () => exec(toggleMark(notesSchema.marks.em)),
            <Italic className="w-3.5 h-3.5" />,
            'Italic',
            isActive('em'),
          )}
          {toolbarBtn(
            () => exec(toggleMark(notesSchema.marks.underline)),
            <Underline className="w-3.5 h-3.5" />,
            'Underline',
            isActive('underline'),
          )}
          {toolbarBtn(insertLink, <Link className="w-3.5 h-3.5" />, 'Insert link', isActive('link'))}
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
          {toolbarBtn(
            () => exec(setBlockType(notesSchema.nodes.heading, { level: 2 })),
            <Heading2 className="w-3.5 h-3.5" />,
            'Heading 2',
          )}
          {toolbarBtn(
            () => exec(setBlockType(notesSchema.nodes.heading, { level: 3 })),
            <Heading3 className="w-3.5 h-3.5" />,
            'Heading 3',
          )}
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
          {toolbarBtn(
            () => exec(wrapInList(notesSchema.nodes.bullet_list)),
            <List className="w-3.5 h-3.5" />,
            'Bullet list',
          )}
          {toolbarBtn(
            () => exec(wrapInList(notesSchema.nodes.ordered_list)),
            <ListOrdered className="w-3.5 h-3.5" />,
            'Ordered list',
          )}
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
          {toolbarBtn(handleImageUpload, <ImagePlus className="w-3.5 h-3.5" />, 'Insert image')}
        </div>
      )}

      {/* ProseMirror mount */}
      <div
        ref={mountRef}
        data-placeholder={placeholder}
        className={cn(
          'flex-1 overflow-y-auto px-4 py-3',
          'prose prose-sm dark:prose-invert max-w-none',
          'focus-within:outline-none',
          '[&_.ProseMirror]:min-h-full [&_.ProseMirror]:outline-none',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-gray-400',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:dark:text-gray-600',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left',
          '[&_.notes-inline-img]:max-w-full [&_.notes-inline-img]:rounded-lg [&_.notes-inline-img]:my-2',
          '[&_.ProseMirror_a]:text-violet-600 [&_.ProseMirror_a]:underline',
        )}
      />
    </div>
  );
}
