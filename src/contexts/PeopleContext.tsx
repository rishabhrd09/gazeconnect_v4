/**
 * GazeConnect Pro - People Context
 * ==================================
 * Manages the configurable list of people.
 * Falls back to defaultPeople.json when no custom data exists.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { Person } from '../types/PeopleTypes';
import defaultPeople from '../data/defaultPeople.json';

interface PeopleContextValue {
  people: Person[];
  addPerson: (person: Person) => void;
  removePerson: (name: string) => void;
  updatePerson: (name: string, updated: Person) => void;
  resetToDefaults: () => void;
  setPeople: (people: Person[]) => void;
}

const PeopleContext = createContext<PeopleContextValue | null>(null);

export const usePeople = (): PeopleContextValue => {
  const ctx = useContext(PeopleContext);
  if (!ctx) throw new Error('usePeople must be used within PeopleProvider');
  return ctx;
};

/** Generate default phrases for a new person */
export function generateDefaultPhrases(name: string, nameHi: string): { en: string; hi: string }[] {
  return [
    { en: `Call ${name}`, hi: `${nameHi} को बुलाओ` },
    { en: `${name} come here`, hi: `${nameHi} यहाँ आओ` },
    { en: `Talk to ${name}`, hi: `${nameHi} से बात करो` },
    { en: `Where is ${name}`, hi: `${nameHi} कहाँ है` },
    { en: `${name} thank you`, hi: `${nameHi} धन्यवाद` },
  ];
}

interface PeopleProviderProps {
  children: React.ReactNode;
  initialPeople?: Person[];
  onPeopleChange?: (people: Person[]) => void;
}

export const PeopleProvider: React.FC<PeopleProviderProps> = ({
  children, initialPeople, onPeopleChange,
}) => {
  const [people, setPeopleState] = useState<Person[]>(
    initialPeople ?? (defaultPeople as Person[])
  );

  const setPeople = useCallback((newPeople: Person[]) => {
    setPeopleState(newPeople);
    onPeopleChange?.(newPeople);
  }, [onPeopleChange]);

  const addPerson = useCallback((person: Person) => {
    setPeopleState(prev => {
      const next = [...prev, person];
      onPeopleChange?.(next);
      return next;
    });
  }, [onPeopleChange]);

  const removePerson = useCallback((name: string) => {
    setPeopleState(prev => {
      const next = prev.filter(p => p.name !== name);
      onPeopleChange?.(next);
      return next;
    });
  }, [onPeopleChange]);

  const updatePerson = useCallback((name: string, updated: Person) => {
    setPeopleState(prev => {
      const next = prev.map(p => p.name === name ? updated : p);
      onPeopleChange?.(next);
      return next;
    });
  }, [onPeopleChange]);

  const resetToDefaults = useCallback(() => {
    const defaults = defaultPeople as Person[];
    setPeopleState(defaults);
    onPeopleChange?.(defaults);
  }, [onPeopleChange]);

  return (
    <PeopleContext.Provider value={{ people, addPerson, removePerson, updatePerson, resetToDefaults, setPeople }}>
      {children}
    </PeopleContext.Provider>
  );
};
