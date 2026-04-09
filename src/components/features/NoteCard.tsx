import type { Note } from '../../types';
import { formatDateTime } from '../../utils';
import './NoteCard.css';

interface NoteCardProps {
  note: Note;
  onDelete: (id: string) => void;
  onClick: (note: Note) => void;
  onTagClick?: (tag: string) => void;
  canEdit?: boolean;
}

export function NoteCard({ note, onDelete, onClick, onTagClick, canEdit = false }: NoteCardProps) {
  const codingLanguages = note.type === 'coding'
    ? note.solutions?.map((item) => item.language) || (note.language ? [note.language] : [])
    : [];
  const qaLanguages = note.type === 'qa'
    ? note.solutions?.map((item) => item.language) || (note.language ? [note.language] : [])
    : [];
  const noteLanguages = [...new Set([...qaLanguages, ...codingLanguages].filter(Boolean))];

  const getPreviewText = () => {
    switch (note.type) {
      case 'qa':
        return note.question || '';
      case 'coding':
        return note.problem || '';
      case 'blog':
        return note.content?.substring(0, 150) || '';
      default:
        return '';
    }
  };

  const getPreviewLabel = () => {
    switch (note.type) {
      case 'qa':
        return 'Question';
      case 'coding':
        return 'Problem';
      case 'blog':
        return 'Summary';
      default:
        return 'Preview';
    }
  };

  const previewText = getPreviewText();
  const metaText = [note.category, noteLanguages[0], formatDateTime(note.updatedAt)]
    .filter(Boolean)
    .join(' • ');

  return (
    <article className="note-card" onClick={() => onClick(note)}>
      <div className="note-card-header">
        <span className="type-label">{note.type.toUpperCase()}</span>
        <span className="note-date">{formatDateTime(note.updatedAt)}</span>
      </div>

      <h3 className="note-title">{note.title}</h3>

      {metaText && <p className="note-meta-strip">{metaText}</p>}

      <div className="note-reading-block">
        <span className="note-reading-label">{getPreviewLabel()}</span>
        <p className="note-preview">{previewText}</p>
      </div>

      {noteLanguages.length > 0 && (
        <div className="note-language">
          {noteLanguages.map((lang) => (
            <span key={lang} className="lang-badge">{lang}</span>
          ))}
        </div>
      )}

      {note.tags && note.tags.length > 0 && (
        <div className="note-tags">
          {note.tags.slice(0, 3).map((tag) => (
            <span 
              key={tag} 
              className="note-tag"
              onClick={(e) => {
                e.stopPropagation();
                onTagClick?.(tag);
              }}
              style={{ cursor: onTagClick ? 'pointer' : 'default' }}
            >
              #{tag}
            </span>
          ))}
          {note.tags.length > 3 && (
            <span className="note-tag-more">+{note.tags.length - 3} more</span>
          )}
        </div>
      )}

      <div className="note-footer">
        <span className="note-open-hint">Read note</span>
        {canEdit && (
          <button
            className="btn-delete"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('Are you sure you want to delete this note?')) {
                onDelete(note.id);
              }
            }}
          >
            🗑️ Delete
          </button>
        )}
      </div>
    </article>
  );
}
