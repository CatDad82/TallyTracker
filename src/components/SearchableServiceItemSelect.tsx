import React, { useState, useEffect, useRef } from "react";
import { Search, X, ChevronDown } from "lucide-react";
import { NETSUITE_DATA } from "../data.js";

interface SearchableServiceItemSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const SearchableServiceItemSelect: React.FC<SearchableServiceItemSelectProps> = ({
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

  // Filter service items based on the search query
  const filtered = NETSUITE_DATA.service_items.filter(item => {
    return item.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Limit items to prevent heavy DOM rendering (though list is usually smaller, still good practice)
  const maxMatches = 100;
  const displayedItems = filtered.slice(0, maxMatches);

  // When value changes from outside, reset search
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("");
    }
  }, [isOpen]);

  // Handle select option
  const handleSelect = (item: string) => {
    onChange(item);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setIsOpen(false);
  };

  // Find current display label
  const currentLabel = value ? value : "— Select Service Item —";

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
              placeholder="Type to search service items..."
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

          {/* Service Items List */}
          <div className="overflow-y-auto flex-1 divide-y divide-brand-navy/10 max-h-56">
            {displayedItems.length > 0 ? (
              displayedItems.map((item) => {
                const isSelected = value === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => handleSelect(item)}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-brand-accent flex flex-col gap-0.5 ${
                      isSelected ? "bg-brand-red/10 font-bold text-brand-red" : "text-brand-navy"
                    }`}
                  >
                    <span className="font-sans truncate">{item}</span>
                  </button>
                );
              })
            ) : (
              <div className="p-4 text-center text-xs text-brand-dim">
                No matching service items found
              </div>
            )}
          </div>

          {/* Match stats footer */}
          <div className="px-3 py-1.5 border-t border-brand-navy bg-brand-accent text-[10px] text-brand-navy font-mono flex justify-between items-center shrink-0">
            <span>
              Total: {NETSUITE_DATA.service_items.length.toLocaleString()} service items
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
