import useDraftStore from '../stores/draftStore';
import useLCUStore from '../stores/lcuStore';
import useChampionsStore from '../stores/championsStore';

export function startDraftSession() {
  const sync = (live, previous) => {
    const draft = useDraftStore.getState();
    if (draft.mode !== 'live') return;
    if (live.inChampSelect && previous && !previous.inChampSelect) draft.resetDraft('live');
    const catalog = useChampionsStore.getState();
    // Without the catalogue every champion would be recorded as "Champion 157" with a
    // broken icon, permanently, in the timeline and saved replays. Wait for the names;
    // the catalogue subscription below re-syncs as soon as they arrive (or fail).
    if (!catalog.loaded && !catalog.error) return;
    const data = live.getDraftSyncData(catalog.byId);
    if (data) draft.applyLCU(data);
  };
  const offLive = useLCUStore.subscribe(sync);
  const offCatalog = useChampionsStore.subscribe(() => sync(useLCUStore.getState()));
  const offDraft = useDraftStore.subscribe((state, before) => {
    if (state.mode === 'live' && before.mode !== 'live') sync(useLCUStore.getState());
  });
  void useChampionsStore.getState().load();
  useLCUStore.getState().startPolling(500);
  sync(useLCUStore.getState());
  const refresh = setInterval(() => void useChampionsStore.getState().reload(), 3600000);
  return () => { clearInterval(refresh); offLive(); offCatalog(); offDraft(); useLCUStore.getState().stopPolling(); };
}
