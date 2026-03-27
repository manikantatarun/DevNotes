import type { Note } from '../../types';
import { formatDateTime } from '../../utils';
import './NoteCard.css';

interface NoteCardProps {
  note: Note;
  onDelete: (id: string) => void;
  onClick: (note: Note) => void;
  canEdit?: boolean;
}

export function NoteCard({ note, onDelete, onClick, canEdit = false }: NoteCardProps) {
  const codingLanguages = note.type === 'coding'
    ? note.solutions?.map((item) => item.language) || (note.language ? [note.language] : [])
    : [];
  const qaLanguages = note.type === 'qa'
    ? note.solutions?.map((item) => item.language) || (note.language ? [note.language] : [])
    : [];
  const noteLanguages = [...qaLanguages, ...codingLanguages];

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

  return (
    <div className="note-card" onClick={() => onClick(note)}>
      <div className="note-card-header">
        <div className="note-type">
          <span className="type-icon">{getTypeIcon()}</span>
          <span className="type-label">{note.type.toUpperCase()}</span>
        </div>
        <span 
          className="note-category" 
          style={{ backgroundColor: getCategoryColor() }}
        >
          {note.category}
        </span>
      </div>

      <h3 className="note-title">{note.title}</h3>
      
      {noteLanguages.length > 0 && (
        <div className="note-language">
          {noteLanguages.map((lang) => (
            <span key={lang} className="lang-badge">{lang}</span>
          ))}
        </div>
      )}

      <p className="note-preview">{getPreviewText()}</p>

      {note.tags && note.tags.length > 0 && (
        <div className="note-tags">
          {note.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="note-tag">#{tag}</span>
          ))}
          {note.tags.length > 3 && (
            <span className="note-tag-more">+{note.tags.length - 3} more</span>
          )}
        </div>
      )}

      <div className="note-footer">
        <span className="note-date">{formatDateTime(note.updatedAt)}</span>
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
    </div>
  );
}
