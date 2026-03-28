import { useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { rust } from '@codemirror/lang-rust';
import { go } from '@codemirror/lang-go';
import { php } from '@codemirror/lang-php';
import { sql } from '@codemirror/lang-sql';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { markdown } from '@codemirror/lang-markdown';
import type { EditorView } from '@codemirror/view';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { NoteType, Category, Note } from '../../types';
import type { IStorageService } from '../../services/storage/IStorageService';
import { NOTE_TYPES, CATEGORIES, PROGRAMMING_LANGUAGES, DEFAULT_TAGS } from '../../constants';
import './NoteForm.css';

interface NoteFormProps {
  onSubmit: (noteData: any) => void;
  onCancel: () => void;
  initialNote?: Note | null;
  existingTags?: string[];
  storageService: IStorageService;
}

function getCodeExtensions(language: string) {
  switch (language.toLowerCase()) {
    case 'javascript':
      return [javascript()];
    case 'typescript':
      return [javascript({ typescript: true })];
    case 'python':
      return [python()];
    case 'java':
      return [java()];
    case 'cpp':
      return [cpp()];
    case 'rust':
      return [rust()];
    case 'go':
      return [go()];
    case 'php':
      return [php()];
    case 'sql':
      return [sql()];
    case 'html':
      return [html()];
    case 'css':
      return [css()];
    case 'markdown':
      return [markdown()];
    default:
      return [];
  }
}

export function NoteForm({ onSubmit, onCancel, initialNote = null, existingTags = [], storageService }: NoteFormProps) {
  const [type, setType] = useState<NoteType>(initialNote?.type ?? 'qa');
  const [category, setCategory] = useState<Category>(initialNote?.category ?? 'general');
  const [title, setTitle] = useState(initialNote?.title ?? '');
  const [question, setQuestion] = useState(initialNote?.question ?? '');
  const [answer, setAnswer] = useState(initialNote?.answer ?? '');
  const [qaLanguage, setQaLanguage] = useState(initialNote?.language ?? 'javascript');
  const [problem, setProblem] = useState(initialNote?.problem ?? '');
  const [codingSolutions, setCodingSolutions] = useState(() => {
    if (initialNote?.solutions && initialNote.solutions.length > 0) {
      return initialNote.solutions;
    }

    if (initialNote?.type === 'coding') {
      if (initialNote.solutions && initialNote.solutions.length > 0) {
        return initialNote.solutions;
      }

      if (initialNote.language && initialNote.solution) {
        return [{ language: initialNote.language, solution: initialNote.solution }];
      }
    }

    if (initialNote?.type === 'qa' && initialNote?.category === 'coding' && initialNote.language && initialNote.answer) {
      return [{ language: initialNote.language, solution: initialNote.answer }];
    }

    return [{ language: 'javascript', solution: '' }];
  });
  const [content, setContent] = useState(initialNote?.content ?? '');
  const [tags, setTags] = useState<string[]>(initialNote?.tags ?? []);
  const [newTag, setNewTag] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [imageUploadMessage, setImageUploadMessage] = useState<string | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const blogEditorViewRef = useRef<EditorView | null>(null);

  const focusBlogEditor = () => {
    requestAnimationFrame(() => {
      blogEditorViewRef.current?.focus();
    });
  };

  const insertIntoBlogEditor = (text: string, selectionOverride?: { from: number; to: number }) => {
    const view = blogEditorViewRef.current;

    if (!view) {
      setContent((prev) => `${prev}${text}`);
      return;
    }

    const selection = selectionOverride ?? {
      from: view.state.selection.main.from,
      to: view.state.selection.main.to,
    };

    view.dispatch({
      changes: {
        from: selection.from,
        to: selection.to,
        insert: text,
      },
      selection: {
        anchor: selection.from + text.length,
      },
    });

    focusBlogEditor();
  };

  const wrapBlogSelection = (prefix: string, suffix: string, placeholder: string) => {
    const view = blogEditorViewRef.current;

    if (!view) {
      const fallback = `${prefix}${placeholder}${suffix}`;
      setContent((prev) => `${prev}${fallback}`);
      return;
    }

    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    const inner = selected || placeholder;
    const nextText = `${prefix}${inner}${suffix}`;
    const anchor = from + prefix.length + inner.length;

    view.dispatch({
      changes: { from, to, insert: nextText },
      selection: { anchor },
    });

    focusBlogEditor();
  };

  const insertBlockAtCursor = (block: string) => {
    const view = blogEditorViewRef.current;

    if (!view) {
      setContent((prev) => `${prev}${block}`);
      return;
    }

    const { from, to } = view.state.selection.main;
    const doc = view.state.doc.toString();
    const needsLeadingBreak = from > 0 && !doc.slice(0, from).endsWith('\n\n');
    const needsTrailingBreak = to < doc.length && !doc.slice(to).startsWith('\n\n');
    const text = `${needsLeadingBreak ? '\n\n' : ''}${block}${needsTrailingBreak ? '\n\n' : ''}`;

    insertIntoBlogEditor(text, { from, to });
  };

  const handleInsertLink = () => {
    const text = window.prompt('Link text', 'Read more');
    if (text === null) return;

    const url = window.prompt('Link URL', 'https://');
    if (!url) return;

    insertIntoBlogEditor(`[${text || 'Read more'}](${url})`);
  };

  const handleBlogToolbarAction = (action: string) => {
    switch (action) {
      case 'h1':
        insertBlockAtCursor('# Heading');
        break;
      case 'h2':
        insertBlockAtCursor('## Section title');
        break;
      case 'h3':
        insertBlockAtCursor('### Subsection');
        break;
      case 'bold':
        wrapBlogSelection('**', '**', 'bold text');
        break;
      case 'italic':
        wrapBlogSelection('*', '*', 'italic text');
        break;
      case 'quote':
        insertBlockAtCursor('> Important note');
        break;
      case 'ul':
        insertBlockAtCursor('- First point\n- Second point\n- Third point');
        break;
      case 'ol':
        insertBlockAtCursor('1. First step\n2. Second step\n3. Third step');
        break;
      case 'code':
        insertBlockAtCursor('```ts\nconst example = true;\n```');
        break;
      case 'inline-code':
        wrapBlogSelection('`', '`', 'code');
        break;
      case 'link':
        handleInsertLink();
        break;
      case 'divider':
        insertBlockAtCursor('---');
        break;
      default:
        break;
    }
  };

  const buildImageAlt = (fileName: string) => {
    const plainName = fileName.replace(/\.[^.]+$/, '');
    const normalized = plainName.replace(/[-_]+/g, ' ').trim();
    return normalized || 'Blog image';
  };

  const appendMarkdownImage = (markdownImage: string, selectionOverride?: { from: number; to: number }) => {
    const imageBlock = `\n\n${markdownImage}\n\n`;
    insertIntoBlogEditor(imageBlock, selectionOverride);
  };

  const uploadBlogImageFile = async (file: File, selectionOverride?: { from: number; to: number }) => {
    if (!file.type.startsWith('image/')) {
      setImageUploadError('Please choose an image file.');
      setImageUploadMessage(null);
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setImageUploadError('Please upload an image smaller than 8 MB.');
      setImageUploadMessage(null);
      return;
    }

    try {
      setIsUploadingImage(true);
      setImageUploadError(null);
      setImageUploadMessage(null);

      const imageUrl = await storageService.uploadImage(file);
      const markdownImage = `![${buildImageAlt(file.name)}](${imageUrl})`;

      appendMarkdownImage(markdownImage, selectionOverride);
      setImageUploadMessage(`Inserted ${file.name} into your blog content.`);
    } catch (err) {
      setImageUploadError(err instanceof Error ? err.message : 'Failed to upload image.');
      setImageUploadMessage(null);
    } finally {
      setIsUploadingImage(false);
      setIsDraggingImage(false);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    await uploadBlogImageFile(file);
  };

  const handleEditorDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if ([...event.dataTransfer.items].some((item) => item.type.startsWith('image/'))) {
      event.preventDefault();
      setIsDraggingImage(true);
    }
  };

  const handleEditorDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setIsDraggingImage(false);
  };

  const handleEditorDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingImage(false);

    const imageFile = [...event.dataTransfer.files].find((file) => file.type.startsWith('image/'));
    if (!imageFile) return;

    const view = blogEditorViewRef.current;
    let selectionOverride: { from: number; to: number } | undefined;

    if (view) {
      const dropPos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (typeof dropPos === 'number') {
        selectionOverride = { from: dropPos, to: dropPos };
      }
    }

    await uploadBlogImageFile(imageFile, selectionOverride);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const baseData = {
      type,
      category,
      title,
      tags,
    };

    let noteData;
    switch (type) {
      case 'qa': {
        const isCodingCategory = category === 'coding';
        const validSolutions = codingSolutions
          .map((item) => ({
            language: item.language.trim(),
            solution: item.solution.trim(),
          }))
          .filter((item) => item.language && item.solution);

        if (isCodingCategory && validSolutions.length === 0) {
          alert('Please add at least one code answer with language and code.');
          return;
        }

        noteData = {
          ...baseData,
          question,
          answer: isCodingCategory ? validSolutions[0]?.solution : answer,
          language: isCodingCategory ? validSolutions[0]?.language : qaLanguage,
          solutions: isCodingCategory ? validSolutions : undefined,
        };
        break;
      }
      case 'coding': {
        const validSolutions = codingSolutions
          .map((item) => ({
            language: item.language.trim(),
            solution: item.solution.trim(),
          }))
          .filter((item) => item.language && item.solution);

        if (validSolutions.length === 0) {
          alert('Please add at least one code solution with language and code.');
          return;
        }

        noteData = {
          ...baseData,
          problem,
          solutions: validSolutions,
          language: validSolutions[0]?.language,
          solution: validSolutions[0]?.solution,
        };
        break;
      }
      case 'blog':
        if (!content.trim()) {
          alert('Please add blog content in markdown.');
          return;
        }
        noteData = { ...baseData, content };
        break;
    }

    onSubmit(noteData);
  };

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const addDefaultTag = (tag: string) => {
    if (!tags.includes(tag)) {
      setTags([...tags, tag]);
    }
  };

  const updateCodingSolution = (index: number, key: 'language' | 'solution', value: string) => {
    setCodingSolutions((prev) => prev.map((item, i) => i === index ? { ...item, [key]: value } : item));
  };

  const addCodingSolution = () => {
    setCodingSolutions((prev) => [...prev, { language: 'python', solution: '' }]);
  };

  const removeCodingSolution = (index: number) => {
    setCodingSolutions((prev) => prev.filter((_, i) => i !== index));
  };

  const renderCodingSolutionsEditor = (placeholder: string) => (
    <div className="form-group">
      <label>Code Answers (multiple languages)</label>
      <div className="coding-solutions">
        {codingSolutions.map((item, index) => (
          <div key={index} className="coding-solution-item">
            <div className="coding-solution-header">
              <span className="coding-solution-title">Answer {index + 1}</span>
              {codingSolutions.length > 1 && (
                <button
                  type="button"
                  className="remove-solution-btn"
                  onClick={() => removeCodingSolution(index)}
                >
                  Remove
                </button>
              )}
            </div>
            <select
              value={item.language}
              onChange={(e) => updateCodingSolution(index, 'language', e.target.value)}
              required
            >
              {PROGRAMMING_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
            <div className="code-editor-wrapper">
              <CodeMirror
                value={item.solution}
                onChange={(value) => updateCodingSolution(index, 'solution', value)}
                theme={oneDark}
                height="260px"
                extensions={getCodeExtensions(item.language)}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  bracketMatching: true,
                  highlightActiveLine: true,
                }}
                placeholder={placeholder}
              />
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="add-solution-btn" onClick={addCodingSolution}>
        + Add Another Language
      </button>
    </div>
  );

  return (
    <form className="note-form" onSubmit={handleSubmit}>
      <h2>{initialNote ? 'Edit Note' : 'Create New Note'}</h2>

      <div className="form-row">
        <div className="form-group">
          <label>Type *</label>
          <div className="type-selector">
            {NOTE_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                className={`type-btn ${type === t.value ? 'active' : ''}`}
                onClick={() => setType(t.value as NoteType)}
              >
                <span className="type-icon">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter title..."
            required
          />
        </div>

        <div className="form-group">
          <label>Category *</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)} required>
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {type === 'qa' && (
        <>
          <div className="form-group">
            <label>Question *</label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Enter your question..."
              rows={3}
              required
            />
          </div>

          {category === 'coding' ? (
            renderCodingSolutionsEditor('Add code answer...')
          ) : (
            <>
              <div className="form-group">
                <label>Language *</label>
                <select value={qaLanguage} onChange={(e) => setQaLanguage(e.target.value)} required>
                  {PROGRAMMING_LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Answer *</label>
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Enter the answer..."
                  rows={5}
                  required
                />
              </div>
            </>
          )}
        </>
      )}

      {type === 'coding' && (
        <>
          <div className="form-group">
            <label>Problem Description *</label>
            <textarea
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              placeholder="Describe the problem..."
              rows={3}
              required
            />
          </div>

          {renderCodingSolutionsEditor('Paste your code solution...')}
        </>
      )}

      {type === 'blog' && (
        <>
          <div className="form-group">
            <label>Content (Markdown) *</label>
            <div className="blog-editor-toolbar">
              <div className="blog-toolbar-group">
                <button type="button" className="blog-toolbar-btn" onClick={() => handleBlogToolbarAction('h1')}>H1</button>
                <button type="button" className="blog-toolbar-btn" onClick={() => handleBlogToolbarAction('h2')}>H2</button>
                <button type="button" className="blog-toolbar-btn" onClick={() => handleBlogToolbarAction('h3')}>H3</button>
              </div>
              <div className="blog-toolbar-group">
                <button type="button" className="blog-toolbar-btn" onClick={() => handleBlogToolbarAction('bold')}><strong>B</strong></button>
                <button type="button" className="blog-toolbar-btn" onClick={() => handleBlogToolbarAction('italic')}><em>I</em></button>
                <button type="button" className="blog-toolbar-btn" onClick={() => handleBlogToolbarAction('inline-code')}>Code</button>
                <button type="button" className="blog-toolbar-btn" onClick={() => handleBlogToolbarAction('link')}>Link</button>
              </div>
              <div className="blog-toolbar-group">
                <button type="button" className="blog-toolbar-btn" onClick={() => handleBlogToolbarAction('quote')}>Quote</button>
                <button type="button" className="blog-toolbar-btn" onClick={() => handleBlogToolbarAction('ul')}>List</button>
                <button type="button" className="blog-toolbar-btn" onClick={() => handleBlogToolbarAction('ol')}>Steps</button>
                <button type="button" className="blog-toolbar-btn" onClick={() => handleBlogToolbarAction('code')}>Block</button>
                <button type="button" className="blog-toolbar-btn" onClick={() => handleBlogToolbarAction('divider')}>---</button>
              </div>
              <button
                type="button"
                className="blog-upload-btn"
                onClick={() => imageInputRef.current?.click()}
                disabled={isUploadingImage}
              >
                {isUploadingImage ? 'Uploading image...' : '🖼️ Add Image'}
              </button>
              <span className="blog-editor-hint">
                Upload an image and insert markdown automatically.
              </span>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="blog-image-input"
                onChange={handleImageUpload}
              />
            </div>
            <div className="blog-editor-hint blog-editor-drop-hint">
              Use the toolbar for headings, links, lists, and code. Drag an image into the editor to upload it at the current drop position.
            </div>
            {(imageUploadError || imageUploadMessage) && (
              <div className={`blog-upload-feedback ${imageUploadError ? 'error' : 'success'}`}>
                {imageUploadError ?? imageUploadMessage}
              </div>
            )}
            <div className="blog-editor-layout">
              <div
                className={`code-editor-wrapper blog-editor-surface ${isDraggingImage ? 'drag-over' : ''}`}
                onDragOver={handleEditorDragOver}
                onDragLeave={handleEditorDragLeave}
                onDrop={handleEditorDrop}
              >
                {isDraggingImage && <div className="blog-drop-overlay">Drop image to upload and insert</div>}
                <CodeMirror
                  value={content}
                  onChange={setContent}
                  onCreateEditor={(view) => {
                    blogEditorViewRef.current = view;
                  }}
                  theme={oneDark}
                  height="420px"
                  extensions={[markdown()]}
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    highlightActiveLine: true,
                  }}
                  placeholder="Write your blog content in markdown..."
                />
              </div>

              <div className="markdown-preview blog-preview-panel">
                <div className="blog-preview-heading">Live Preview</div>
                <div className="blog-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {content || 'Start writing markdown to preview your blog.'}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="form-group">
        <label>Tags</label>
        <div className="tags-container">
          {tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
              <button type="button" onClick={() => removeTag(tag)}>×</button>
            </span>
          ))}
        </div>
        <div className="tag-input-row">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
            placeholder="Add a tag..."
          />
          <button type="button" onClick={addTag} className="add-tag-btn">
            Add Tag
          </button>
        </div>
        <div className="suggested-tags">
          {[
            ...existingTags,
            ...DEFAULT_TAGS.filter((t) => !existingTags.includes(t)),
          ]
            .filter((tag) => !tags.includes(tag))
            .slice(0, 12)
            .map((tag) => (
              <button
                key={tag}
                type="button"
                className="suggestion"
                onClick={() => addDefaultTag(tag)}
              >
                + {tag}
              </button>
            ))}
        </div>
      </div>

      <div className="form-actions">
        <button type="button" onClick={onCancel} className="btn-cancel">
          Cancel
        </button>
        <button type="submit" className="btn-submit">
          {initialNote ? 'Update Note' : 'Create Note'}
        </button>
      </div>
    </form>
  );
}
