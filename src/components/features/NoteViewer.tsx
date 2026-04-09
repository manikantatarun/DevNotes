import type { Category, Note, NoteType } from '../../types';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatDateTime } from '../../utils';
import { FilterBar } from './FilterBar';
import './NoteViewer.css';

interface NoteTypeOption {
  value: NoteType;
  label: string;
  icon: string;
}

interface CategoryOption {
  value: Category;
  label: string;
}

interface NoteViewerProps {
  note: Note;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  positionLabel?: string;
  scopeLabel?: string;
  navigationDirection?: 'prev' | 'next' | null;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  filterType: NoteType | 'all';
  onFilterTypeChange: (value: NoteType | 'all') => void;
  filterCategories: Category[];
  onFilterCategoriesChange: (value: Category[]) => void;
  filterLanguages: string[];
  onFilterLanguagesChange: (value: string[]) => void;
  filterTags: string[];
  onFilterTagsChange: (value: string[]) => void;
  availableLanguages: string[];
  availableTags: string[];
  popularTags: string[];
  noteTypeOptions: readonly NoteTypeOption[];
  categoryOptions?: readonly CategoryOption[];  // Optional now
  isFiltered: boolean;
  onClearFilters: () => void;
  canEdit?: boolean;
}

export function NoteViewer({
  note,
  onClose,
  onEdit,
  onDelete,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
  positionLabel,
  scopeLabel,
  navigationDirection = null,
  searchTerm,
  onSearchTermChange,
  filterType,
  onFilterTypeChange,
  filterCategories,
  onFilterCategoriesChange,
  filterLanguages,
  onFilterLanguagesChange,
  availableLanguages,
  filterTags,
  onFilterTagsChange,
  popularTags,
  isFiltered,
  onClearFilters,
  canEdit = false,
}: NoteViewerProps) {
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const [showCopyFeedback, setShowCopyFeedback] = useState(false);
  const [isMobileView, setIsMobileView] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 768px)').matches;
  });

  const handleShare = async () => {
    const url = `${window.location.origin}/DevNotes/note/${note.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setShowCopyFeedback(true);
      setTimeout(() => setShowCopyFeedback(false), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
      // Fallback: show URL in prompt
      prompt('Copy this URL:', url);
    }
  };

  const slideClass = navigationDirection === 'next'
    ? 'note-viewer-slide-next'
    : navigationDirection === 'prev'
    ? 'note-viewer-slide-prev'
    : 'note-viewer-fade';

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const updateMobileState = (event?: MediaQueryListEvent) => {
      setIsMobileView(event ? event.matches : mediaQuery.matches);
    };
    mediaQuery.addEventListener('change', updateMobileState);
    return () => mediaQuery.removeEventListener('change', updateMobileState);
  }, []);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (isMobileView) return;
    const touch = event.changedTouches[0];
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (isMobileView) return;
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartXRef.current;
    const deltaY = touch.clientY - touchStartYRef.current;

    touchStartXRef.current = null;
    touchStartYRef.current = null;

    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) <= Math.abs(deltaY)) return;

    if (deltaX < 0 && hasNext && onNext) {
      onNext();
      return;
    }

    if (deltaX > 0 && hasPrevious && onPrevious) {
      onPrevious();
    }
  };

  const codingSolutions = note.type === 'coding'
    ? (note.solutions && note.solutions.length > 0
      ? note.solutions
      : (note.language && note.solution
        ? [{ language: note.language, solution: note.solution }]
        : []))
    : [];
  const qaSolutions = note.type === 'qa' && note.category === 'coding'
    ? (note.solutions && note.solutions.length > 0
      ? note.solutions
      : (note.language && note.answer
        ? [{ language: note.language, solution: note.answer }]
        : []))
    : [];
  const qaLanguages = note.type === 'qa'
    ? qaSolutions.map((item) => item.language).length > 0
      ? qaSolutions.map((item) => item.language)
      : (note.language ? [note.language] : [])
    : [];
  const viewerLanguages = [...qaLanguages, ...codingSolutions.map((item) => item.language)];
  const uniqueViewerLanguages = [...new Set(viewerLanguages.filter(Boolean))];

  const getTypeIcon = () => {
    switch (note.type) {
      case 'qa': return '💬';
      case 'coding': return '💻';
      case 'blog': return '📝';
    }
  };

  const getCategoryColor = () => {
    const colors: Record<string, string> = {
      'general': '#667eea',
      'coding': '#00b894',
      'system-design': '#f093fb',
      'algorithms': '#4facfe',
      'frontend': '#43e97b',
      'backend': '#fa709a',
      'database': '#feca57',
      'devops': '#ff6348',
      'other': '#888',
    };
    return colors[note.category] || '#667eea';
  };

  const summaryItems = [
    { label: 'Type', value: note.type.toUpperCase() },
    { label: 'Category', value: note.category },
    { label: 'Updated', value: formatDateTime(note.updatedAt) },
    { label: 'Languages', value: uniqueViewerLanguages.length > 0 ? uniqueViewerLanguages.join(', ') : 'N/A' },
  ];

  return (
    <div
      className={`note-viewer ${slideClass}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="viewer-actions">
        <div className="viewer-left-actions">
          <button className="btn-back" onClick={onClose}>
            ← Back
          </button>
          {positionLabel && <span className="viewer-position">{positionLabel}</span>}
          {scopeLabel && <span className="viewer-scope">{scopeLabel}</span>}
        </div>

        <div className="viewer-right-actions">
          <button 
            className="btn-share" 
            onClick={handleShare}
            title="Copy link to share this note"
          >
            {showCopyFeedback ? '✓ Copied!' : '🔗 Share'}
          </button>
          
          {canEdit && (
            <>
              <button className="btn-edit-viewer" onClick={onEdit}>
                ✏️ Edit
              </button>
              <button
                className="btn-delete-viewer"
                onClick={() => {
                  if (confirm('Are you sure you want to delete this note?')) {
                    onDelete();
                  }
                }}
              >
                🗑️ Delete
              </button>
            </>
          )}
        </div>
      </div>

      <div className="viewer-filters">
        <FilterBar
          searchTerm={searchTerm}
          onSearchTermChange={onSearchTermChange}
          filterType={filterType}
          onFilterTypeChange={onFilterTypeChange}
          filterCategories={filterCategories}
          onFilterCategoriesChange={onFilterCategoriesChange}
          filterLanguages={filterLanguages}
          onFilterLanguagesChange={onFilterLanguagesChange}
          availableLanguages={availableLanguages}
          filterTags={filterTags}
          onFilterTagsChange={onFilterTagsChange}
          popularTags={popularTags}
          isFiltered={isFiltered}
          onClearFilters={onClearFilters}
          remoteLoading={false}
          displayedCount={1}
        />
      </div>

      <button
        className="btn-side-nav btn-side-prev"
        onClick={onPrevious}
        disabled={!hasPrevious}
        aria-label="Previous note"
      >
        ←
      </button>

      <button
        className="btn-side-nav btn-side-next"
        onClick={onNext}
        disabled={!hasNext}
        aria-label="Next note"
      >
        →
      </button>

      <div className="viewer-content">
        <div className="viewer-meta">
          <div className="meta-left">
            <span className="viewer-type">
              {getTypeIcon()} {note.type.toUpperCase()}
            </span>
            <span 
              className="viewer-category"
              style={{ backgroundColor: getCategoryColor() }}
            >
              {note.category}
            </span>
          </div>
          <span className="viewer-date">{formatDateTime(note.updatedAt)}</span>
        </div>

        <h1 className="viewer-title">{note.title}</h1>

        <div className="viewer-summary-grid">
          {summaryItems.map((item) => (
            <div key={item.label} className="viewer-summary-card">
              <span className="viewer-summary-label">{item.label}</span>
              <span className="viewer-summary-value">{item.value}</span>
            </div>
          ))}
        </div>

        {uniqueViewerLanguages.length > 0 && (
          <div className="viewer-language">
            {uniqueViewerLanguages.map((language) => (
              <span key={language} className="lang-badge">{language}</span>
            ))}
          </div>
        )}

        {note.tags && note.tags.length > 0 && (
          <div className="viewer-tags">
            {note.tags.map((tag) => (
              <span 
                key={tag} 
                className="viewer-tag clickable"
                onClick={() => {
                  if (onFilterTagsChange) {
                    onFilterTagsChange([tag]);
                    onClose();
                  }
                }}
                title="Click to filter by this tag"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        <div className="viewer-body">
          {note.type === 'qa' && (
            <>
              <div className="qa-section">
                <h3>Question</h3>
                <div className="qa-content">{note.question}</div>
              </div>
              {note.category === 'coding' && qaSolutions.length > 0 ? (
                qaSolutions.map((item, index) => (
                  <div key={`${item.language}-${index}`} className="coding-section">
                    <h3>Answer ({item.language})</h3>
                    <pre className="code-block"><code>{item.solution}</code></pre>
                  </div>
                ))
              ) : (
                <div className="qa-section">
                  <h3>Answer</h3>
                  <div className="qa-content">{note.answer}</div>
                </div>
              )}
            </>
          )}

          {note.type === 'coding' && (
            <>
              <div className="coding-section">
                <h3>Problem</h3>
                <div className="coding-content">{note.problem}</div>
              </div>

              {codingSolutions.map((item, index) => (
                <div key={`${item.language}-${index}`} className="coding-section">
                  <h3>Solution ({item.language})</h3>
                  <pre className="code-block"><code>{item.solution}</code></pre>
                </div>
              ))}
            </>
          )}

          {note.type === 'blog' && (
            <div className="blog-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {note.content || ''}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>

      <div className="viewer-mobile-nav" aria-label="Mobile note navigation">
        <button
          className="btn-mobile-nav"
          onClick={onPrevious}
          disabled={!hasPrevious}
          aria-label="Previous note"
        >
          ← Previous
        </button>

        <span className="mobile-swipe-hint">Use Previous / Next</span>

        <button
          className="btn-mobile-nav"
          onClick={onNext}
          disabled={!hasNext}
          aria-label="Next note"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
