import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { buildIndices, computeStats } from '../utils/deckMath';

// Type definitions for the data
export interface CardCount {
  name: string;
  count: number;
}

export interface Deck {
  player: string;
  event: string;
  placement: string;
  event_date?: string;
  label: string;
  cards: CardCount[];
  sideboard?: CardCount[];
  runes?: CardCount[];
  battlefields?: CardCount[];
  _region?: string;
  _cluster?: string;
  _clusterName?: string;
  weight?: number;
}

export interface Filters {
  region: Set<string>;
  cluster: Set<string>;
  placement: Set<string>;
  from: string;
  to: string;
  dedupe: boolean;
  fieldWeight: boolean;
}

interface AppContextType {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  allDecks: Deck[];
  globalDecks: Deck[];
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  clearFilters: () => void;
  cards: any; // The global cards catalogue
  field: any; // The global field catalogue
  meta: any; // The global meta data
  isLoading: boolean;
  
  // Derived Global Maps
  imageMap: Record<string, string>;
  cardMeta: Record<string, any>;
  nameLookup: Record<string, string>;
  nonMainNames: Set<string>;
  rankedCards: any[];

  // Builder State
  mainDeck: Record<string, number>;
  setMainDeck: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  sideDeck: Record<string, number>;
  setSideDeck: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  builderRunes: Record<string, number>;
  setBuilderRunes: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  builderBf: string[];
  setBuilderBf: React.Dispatch<React.SetStateAction<string[]>>;
}

const defaultFilters: Filters = {
  region: new Set(),
  cluster: new Set(),
  placement: new Set(),
  from: '',
  to: '',
  dedupe: false,
  fieldWeight: false,
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [allDecks, setAllDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<any>(null);
  const [field, setField] = useState<any>(null);
  const [meta, setMeta] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  // Builder State
  const [mainDeck, setMainDeck] = useState<Record<string, number>>({});
  const [sideDeck, setSideDeck] = useState<Record<string, number>>({});
  const [builderRunes, setBuilderRunes] = useState<Record<string, number>>({ Fury: 12 });
  const [builderBf, setBuilderBf] = useState<string[]>([]);

  // Initialize theme from local storage
  useEffect(() => {
    try {
      const storedTheme = localStorage.getItem('ddl-theme');
      if (storedTheme === 'light' || storedTheme === 'dark') {
        setTheme(storedTheme);
      }
    } catch (e) {}
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    try {
      localStorage.setItem('ddl-theme', newTheme);
    } catch (e) {}
  };

  useEffect(() => {
    // Apply theme to document
    if (theme === 'light') {
      document.body.classList.add('light');
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#f5f2ea');
    } else {
      document.body.classList.remove('light');
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#0a0d14');
    }
  }, [theme]);

  // Load JSON data
  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        const [decksRes, cardsRes, fieldRes, metaRes] = await Promise.all([
          fetch('/decks.json').then(res => res.json()),
          fetch('/cards.json').then(res => res.json()),
          fetch('/field.json').then(res => res.json()),
          fetch('/meta.json').then(res => res.json()),
        ]);

        if (isMounted) {
          setAllDecks(decksRes);
          setCards(cardsRes);
          setField(fieldRes);
          setMeta(metaRes);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to load data', err);
        if (isMounted) setIsLoading(false);
      }
    };
    loadData();
    return () => { isMounted = false; };
  }, []);

  // Load state from local storage on mount
  useEffect(() => {
    try {
      const storedRunes = localStorage.getItem('ddl-runes');
      if (storedRunes) setBuilderRunes(JSON.parse(storedRunes));
      const storedBf = localStorage.getItem('ddl-bf');
      if (storedBf) setBuilderBf(JSON.parse(storedBf));
      
      const storedCoach = localStorage.getItem('ddl-coach');
      if (storedCoach) {
         import('../utils/deckMath').then(({ /* parseDeckText */ }) => {
            // Lazy load the parser just for initial hydration if needed, 
            // but actually we will do this better later. Let's just keep the text for now.
         });
      }
    } catch (e) {}
  }, []);

  // Save builder state to local storage when changed
  useEffect(() => {
    localStorage.setItem('ddl-runes', JSON.stringify(builderRunes));
  }, [builderRunes]);
  useEffect(() => {
    localStorage.setItem('ddl-bf', JSON.stringify(builderBf));
  }, [builderBf]);

  const { imageMap, cardMeta, nameLookup, nonMainNames, rankedCards } = useMemo(() => {
    if (!allDecks || allDecks.length === 0 || !field) {
      return { imageMap: {}, cardMeta: {}, nameLookup: {}, nonMainNames: new Set<string>(), rankedCards: [] };
    }
    const indices = buildIndices(allDecks, field);
    const ranked = computeStats(allDecks);
    return { ...indices, rankedCards: ranked };
  }, [allDecks, field]);

  // Filter global decks based on current filters (stubbed for now)
  const globalDecks = useMemo(() => {
    if (!allDecks) return [];
    // TODO: implement actual filtering logic as in original index.html applyFilters()
    return allDecks;
  }, [allDecks, filters]);

  const clearFilters = () => setFilters(defaultFilters);

  return (
    <AppContext.Provider value={{
      theme, toggleTheme,
      allDecks, globalDecks,
      filters, setFilters, clearFilters,
      cards, field, meta,
      isLoading,
      imageMap, cardMeta, nameLookup, nonMainNames, rankedCards,
      mainDeck, setMainDeck, sideDeck, setSideDeck, builderRunes, setBuilderRunes, builderBf, setBuilderBf
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
