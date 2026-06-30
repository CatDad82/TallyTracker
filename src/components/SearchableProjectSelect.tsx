import React, { useState, useEffect, useRef } from "react";
import { Search, X, ChevronDown } from "lucide-react";
import { NETSUITE_DATA } from "../data.js";

interface SearchableProjectSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const SearchableProjectSelect: React.FC<SearchableProjectSelectProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Filter projects based on the search query (code or name)
  const filtered = NETSUITE_DATA.projects.filter(p => {
    const term = searchTerm.toLowerCase();
    return (
      p.code.toLowerCase().includes(term) ||
      p.name.toLowerCase().includes(term)
    );
  });

  // Limit items to prevent heavy DOM rendering for 1300+ entries
  const maxMatches = 100;
  const displayedProjects = filtered.slice(0, maxMatches);

  // When value changes from outside, reset search
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("");
    }
  }, [isOpen]);

  // Handle select option
  const handleSelect = (code: string, name: string) => {
    onChange(`${code} — ${name}`);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setIsOpen(false);
  };

  // Find current display label
  const currentLabel = value ? value : "— Select NetSuite Project —";

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between flat-select text-xs text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[38px]"
      >
        <span className={`truncate ${value ? "text-brand-navy font-semibold" : "text-brand-dim"}`}>
          {currentLabel}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 pl-2">
          {value && !disabled && (
            <span
              onClick={handleClear}
              className="p-0.5 hover:bg-brand-accent rounded text-brand-dim hover:text-brand-red transition-colors"
              title="Clear selection"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown size={14} className={`text-brand-dim transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </button>

      {/* Dropdown Card */}
      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 bg-white border-2 border-brand-navy shadow-xl z-50 overflow-hidden flex flex-col max-h-72">
          {/* Search Header */}
          <div className="p-2 border-b border-brand-navy flex items-center bg-brand-accent gap-2 shrink-0">
            <Search size={14} className="text-brand-navy ml-1" />
            <input
              type="text"
              placeholder="Type to search 1,300+ projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent text-xs text-brand-navy placeholder:text-brand-dim focus:outline-none"
              autoFocus
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="text-brand-dim hover:text-brand-navy p-0.5"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Project List */}
          <div className="overflow-y-auto flex-1 divide-y divide-brand-navy/10 max-h-56">
            {displayedProjects.length > 0 ? (
              displayedProjects.map((p) => {
                const itemVal = `${p.code} — ${p.name}`;
                const isSelected = value === itemVal;
                return (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => handleSelect(p.code, p.name)}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-brand-accent flex flex-col gap-0.5 ${
                      isSelected ? "bg-brand-red/10 font-bold text-brand-red" : "text-brand-navy"
                    }`}
                  >
                    <span className="font-mono text-[10px] text-brand-blue font-semibold">
                      {p.code}
                    </span>
                    <span className="font-sans truncate">{p.name}</span>
                  </button>
                );
              })
            ) : (
              <div className="p-4 text-center text-xs text-brand-dim">
                No matching projects found
              </div>
            )}
          </div>

          {/* Match stats footer */}
          <div className="px-3 py-1.5 border-t border-brand-navy bg-brand-accent text-[10px] text-brand-navy font-mono flex justify-between items-center shrink-0">
            <span>
              Total: {NETSUITE_DATA.projects.length.toLocaleString()} projects
            </span>
            {filtered.length > maxMatches && (
              <span>
                Showing first {maxMatches} matches
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
