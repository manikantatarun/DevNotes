import { useState } from 'react';
import { API_ENDPOINTS, getWorkerUrl } from '../../config';
import './BulkImport.css';

// Template data for downloads
const JSON_TEMPLATE = [
  {
    type: 'qa',
    category: 'coding',
    title: 'What is a closure in JavaScript?',
    question: 'Explain what closures are and how they work in JavaScript',
    answer: 'A closure is a function that has access to variables in its outer (enclosing) function scope, even after the outer function has returned. Closures are created every time a function is created.',
    tags: ['javascript', 'concepts', 'functions'],
    language: 'javascript'
  },
  {
    type: 'coding',
    category: 'algorithms',
    title: 'Two Sum Problem',
    problem: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
    solution: 'function twoSum(nums, target) {\n  const map = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const complement = target - nums[i];\n    if (map.has(complement)) {\n      return [map.get(complement), i];\n    }\n    map.set(nums[i], i);\n  }\n}',
    tags: ['arrays', 'hashmap', 'leetcode'],
    language: 'javascript'
  },
  {
    type: 'blog',
    category: 'devops',
    title: 'Docker Best Practices',
    content: 'Here are some Docker best practices: 1. Use official base images, 2. Minimize layers, 3. Use .dockerignore, 4. Don\'t run as root...',
    tags: ['docker', 'devops', 'best-practices']
  }
];

const CSV_TEMPLATE = `type,category,title,question,answer,tags,language
qa,coding,What is a closure?,Explain closures in JavaScript,A closure is a function that has access to variables in its outer scope,javascript|concepts|functions,javascript
coding,algorithms,Two Sum,Find two numbers that add up to target,Use hashmap to store complements,arrays|hashmap|leetcode,javascript
blog,devops,Docker Best Practices,,,docker|devops|best-practices,`;

interface BulkImportResult {
  ok: boolean;
  total: number;
  succeeded: number;
  failed: number;
  results: {
    success: Array<{ index: number; id: string; title: string }>;
    failed: Array<{ index: number; title: string; error: string }>;
  };
}

interface BulkImportProps {
  onClose: () => void;
  onSuccess: () => void;
  userToken: string;
}

export function BulkImport({ onClose, onSuccess, userToken }: BulkImportProps) {
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const fileContent = await file.text();

      const response = await fetch(getWorkerUrl(API_ENDPOINTS.NOTES_BULK), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Token': userToken,
        },
        body: JSON.stringify({
          format,
          data: fileContent,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Upload failed');
        if (data.invalidNotes) {
          console.error('Validation errors:', data.invalidNotes);
        }
        return;
      }

      setResult(data);
      if (data.succeeded > 0) {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === 'json') {
      content = JSON.stringify(JSON_TEMPLATE, null, 2);
      filename = 'notes-template.json';
      mimeType = 'application/json';
    } else {
      content = CSV_TEMPLATE;
      filename = 'notes-template.csv';
      mimeType = 'text/csv';
    }

    // Create blob and download
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bulk-import-overlay">
      <div className="bulk-import-modal">
        <div className="bulk-import-header">
          <h2>📥 Bulk Import Notes</h2>
          <button className="btn-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="bulk-import-content">
          {!result ? (
            <>
              <div className="format-selector">
                <label>File Format:</label>
                <div className="format-options">
                  <label className="format-option">
                    <input
                      type="radio"
                      value="json"
                      checked={format === 'json'}
                      onChange={() => setFormat('json')}
                    />
                    <span>JSON</span>
                  </label>
                  <label className="format-option">
                    <input
                      type="radio"
                      value="csv"
                      checked={format === 'csv'}
                      onChange={() => setFormat('csv')}
                    />
                    <span>CSV</span>
                  </label>
                </div>
              </div>

              <div className="template-download">
                <button className="btn-download-template" onClick={downloadTemplate}>
                  📥 Download {format.toUpperCase()} Template
                </button>
                <p className="template-hint">
                  Download a sample template to see the correct format
                </p>
              </div>

              <div className="file-upload">
                <input
                  type="file"
                  accept={format === 'json' ? '.json' : '.csv'}
                  onChange={handleFileChange}
                  id="bulk-file-input"
                  className="file-input"
                />
                <label htmlFor="bulk-file-input" className="file-label">
                  {file ? file.name : `Choose ${format.toUpperCase()} file`}
                </label>
              </div>

              <div className="format-help">
                <h3>Format Guide:</h3>
                {format === 'json' ? (
                  <pre>{`[
  {
    "type": "qa",
    "category": "coding",
    "title": "What is closure?",
    "question": "Explain closures in JS",
    "answer": "A closure is...",
    "tags": ["javascript", "concept"],
    "language": "javascript"
  },
  {
    "type": "coding",
    "category": "algorithms",
    "title": "Two Sum",
    "problem": "Find two numbers that add up...",
    "solution": "Use hashmap...",
    "tags": ["arrays", "hashmap"],
    "language": "python"
  }
]`}</pre>
                ) : (
                  <pre>{`type,category,title,question,answer,tags,language
qa,coding,What is closure?,Explain closures,A closure is...,javascript|concept,javascript
coding,algorithms,Two Sum,Find two numbers...,Use hashmap...,arrays|hashmap,python`}</pre>
                )}
              </div>

              {error && <div className="bulk-error">{error}</div>}

              <div className="bulk-actions">
                <button className="btn-cancel" onClick={onClose}>
                  Cancel
                </button>
                <button
                  className="btn-upload"
                  onClick={handleUpload}
                  disabled={!file || uploading}
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </>
          ) : (
            <div className="bulk-result">
              <div className="result-summary">
                <h3>✅ Import Complete</h3>
                <div className="result-stats">
                  <div className="stat">
                    <span className="stat-label">Total:</span>
                    <span className="stat-value">{result.total}</span>
                  </div>
                  <div className="stat success">
                    <span className="stat-label">Succeeded:</span>
                    <span className="stat-value">{result.succeeded}</span>
                  </div>
                  {result.failed > 0 && (
                    <div className="stat failed">
                      <span className="stat-label">Failed:</span>
                      <span className="stat-value">{result.failed}</span>
                    </div>
                  )}
                </div>
              </div>

              {result.results.failed.length > 0 && (
                <div className="failed-notes">
                  <h4>Failed Imports:</h4>
                  <ul>
                    {result.results.failed.map((fail, idx) => (
                      <li key={idx}>
                        <strong>{fail.title}</strong>: {fail.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button className="btn-done" onClick={onClose}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
