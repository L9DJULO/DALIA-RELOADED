/**
 * Which draft a screen shows. The draft components read their store from here, so the
 * same strip, shortlist and panels serve the live draft (default) and the Studio.
 */
import { createContext, useContext } from 'react';
import useDraftStore from './draftStore';

export const DraftContext = createContext(useDraftStore);

/** The store itself, for `getState()` in handlers. */
export const useDraftApi = () => useContext(DraftContext);

/** Subscribe to the current draft, like `useDraftStore(selector)`. */
export function useDraft(selector) {
  return useContext(DraftContext)(selector);
}

/** True in the Studio, the manual draft. */
export const useIsStudio = () => useContext(DraftContext) !== useDraftStore;
