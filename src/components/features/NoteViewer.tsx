import type { Note } from '../../types';
import { formatDateTime } from '../../utils';
import './NoteViewer.css';

interface NoteViewerProps {
  note: Note;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function NoteViewer({ note, onClose, onEdit, onDelete }: NoteViewerProps) {
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

  return (
    <div className="note-viewer">
      <div className="viewer-header">
        <button className="btn-back" onClick={onClose}>
          ← Back
        </button>
        <div className="viewer-actions">
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
        </div>
      </div>

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

        {viewerLanguages.length > 0 && (
          <div className="viewer-language">
            {viewerLanguages.map((language) => (
              <span key={language} className="lang-badge">{language}</span>
            ))}
          </div>
        )}

        {note.tags && note.tags.length > 0 && (
          <div className="viewer-tags">
            {note.tags.map((tag) => (
              <span key={tag} className="viewer-tag">#{tag}</span>
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
              {note.content?.split('\n').map((paragraph, idx) => (
                <p key={idx}>{paragraph}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
