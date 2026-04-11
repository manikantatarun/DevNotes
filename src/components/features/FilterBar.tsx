import { useState } from 'react';
import type { Category, NoteType } from '../../types';
import { NOTE_TYPES, CATEGORIES } from '../../constants';
import './FilterBar.css';

interface FilterBarProps {
  // Search
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  
  // Type filter
  filterType: NoteType | 'all';
  onFilterTypeChange: (value: NoteType | 'all') => void;
  
  // Categories (multi-select)
  filterCategories: Category[];
  onFilterCategoriesChange: (value: Category[]) => void;
  
  // Languages (multi-select)
  filterLanguages: string[];
  onFilterLanguagesChange: (value: string[]) => void;
  availableLanguages: string[];
  
  // Tags (pills)
  filterTags: string[];
  onFilterTagsChange: (value: string[]) => void;
  popularTags: string[];
  
  // Clear filters
  isFiltered: boolean;
  onClearFilters: () => void;
  
  // Results display
  remoteLoading: boolean;
  displayedCount: number;
  
  // Collapsed state (for viewing mode)
  collapsed?: boolean;
}

export function FilterBar({
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
  remoteLoading,
  displayedCount,
  collapsed = false,
}: FilterBarProps) {
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);

  return (
    <div className={`filter-bar ${collapsed ? 'collapsed' : ''}`}>
      {!collapsed && (
        <>
          <div className="search-row">
            <div className="search-box">
              <label htmlFor="notes-search" className="search-label">Search</label>
              <input
                id="notes-search"
                type="text"
                placeholder="Search by topic, question, tag, or language"
                value={searchTerm}
                onChange={(e) => onSearchTermChange(e.target.value)}
              />
            </div>

            {isFiltered && (
              <button
                className="btn-clear-filters"
                onClick={onClearFilters}
              >
                Clear filters
              </button>
            )}
          </div>

      <div className="filters-toolbar">
        <span className="filters-toolbar-label">Filter by</span>

        <div className="filter-row">
          <div className="filter-group">
            <label>Type</label>
            <select value={filterType} onChange={(e) => onFilterTypeChange(e.target.value as NoteType | 'all')}>
              <option value="all">All types</option>
              {NOTE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.icon} {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Category dropdown with checkboxes */}
          <div className="filter-group">
            <label>Categories ({filterCategories.length})</label>
            <div className="custom-dropdown">
              <button
                className="dropdown-toggle"
                onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                onBlur={() => setTimeout(() => setShowCategoryDropdown(false), 200)}
              >
                {filterCategories.length > 0 
                  ? `${filterCategories.length} selected` 
                  : 'Select categories'} ▼
              </button>
              {showCategoryDropdown && (
                <div className="dropdown-menu">
                  {CATEGORIES.map((cat) => (
                    <label key={cat.value} className="dropdown-item">
                      <input
                        type="checkbox"
                        checked={filterCategories.includes(cat.value)}
                        onChange={(e) => {
                          e.stopPropagation();
                          onFilterCategoriesChange(
                            e.target.checked
                              ? [...filterCategories, cat.value]
                              : filterCategories.filter(c => c !== cat.value)
                          );
                        }}
                      />
                      <span>{cat.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Language dropdown with checkboxes */}
          {availableLanguages.length > 0 && (
            <div className="filter-group">
              <label>Languages ({filterLanguages.length})</label>
              <div className="custom-dropdown">
                <button
                  className="dropdown-toggle"
                  onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                  onBlur={() => setTimeout(() => setShowLanguageDropdown(false), 200)}
                >
                  {filterLanguages.length > 0 
                    ? `${filterLanguages.length} selected` 
                    : 'Select languages'} ▼
                </button>
                {showLanguageDropdown && (
                  <div className="dropdown-menu">
                    {availableLanguages.map((lang) => (
                      <label key={lang} className="dropdown-item">
                        <input
                          type="checkbox"
                          checked={filterLanguages.includes(lang)}
                          onChange={(e) => {
                            e.stopPropagation();
                            onFilterLanguagesChange(
                              e.target.checked
                                ? [...filterLanguages, lang]
                                : filterLanguages.filter(l => l !== lang)
                            );
                          }}
                        />
                        <span>{lang}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Popular tag filter pills */}
        {popularTags.length > 0 && (
          <div className="filter-group-tags">
            <label>Popular Tags ({filterTags.length} selected)</label>
            <div className="filter-pills">
              {popularTags.map((tag) => (
                <button
                  key={tag}
                  className={`filter-pill ${filterTags.includes(tag) ? 'active' : ''}`}
                  onClick={() => {
                    onFilterTagsChange(
                      filterTags.includes(tag)
                        ? filterTags.filter(t => t !== tag)
                        : [...filterTags, tag]
                    );
                  }}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="results-strip">
        <span className="results-count">
          {remoteLoading ? (
            <span className="loading-indicator">🔄 Loading results...</span>
          ) : (
            <>Showing {displayedCount} result{displayedCount === 1 ? '' : 's'}</>
          )}
        </span>
        {isFiltered && !remoteLoading && (
          <span className="results-hint">Filtered view is active</span>
        )}
      </div>
        </>
      )}
    </div>
  );
}
