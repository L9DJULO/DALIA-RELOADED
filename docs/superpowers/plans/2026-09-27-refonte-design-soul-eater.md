# Refonte du design Soul Eater — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Appliquer les huit pistes de l'audit design validées par le joueur le 27/09/2026 : fondations réparées, écran de draft lisible d'un regard, score et termes lisibles, rouge réservé, accessibilité, un seul langage visuel, états soignés, signature codifiée.

**Architecture:** Le style quitte les `style={{…}}` et `workshop.css` pour des feuilles CSS par couche (`styles/tokens.css`, `base.css`, `motifs.css`, `components.css`, `shell.css`, `draft.css`, `pages.css`) importées par `index.css`. Les composants de l'écran de draft sont découpés dans `components/Draft/`. La logique pure (termes groupés, géométrie des barres et intervalles, recherche de champion) vit dans `lib/` et porte les tests Vitest. Tailwind est retiré.

**Tech Stack:** React 18 / Vite 8 / Zustand / Vitest (jsdom) / Playwright ; Tauri 2 pour l'application de bureau.

**Spec:** `docs/BRIEF_REDESIGN.md` + audit publié (https://claude.ai/artifact/XMFa7pSg2M5ZACQmiK9Cag) + décisions ci-dessous.

## Décisions du joueur (27/09/2026)

- **Une seule couleur d'accent : le rouge.** Le sélecteur d'accent disparaît (barre du haut et Paramètres), ainsi que `html[data-accent]`, `dalia_accent` et `dalia_intensity`.
- Tout le reste de l'audit est validé : bandeau compact (le board complet est remplacé par un bandeau éditable), libellés de termes en clair, barres vert/rouge + texture par source, Tailwind retiré, Replays et Données fusionnés, tous les lots enchaînés.
- Non tranché par l'audit, choix conservateur : l'analyse reste déclenchée par le joueur (bouton ANALYSER, Entrée quand rien n'a le focus) ; pas d'analyse automatique à chaque pick.

## Global Constraints

- Le moteur ne bouge pas : rien dans `server/`. L'interface affiche ce que renvoie l'API (`breakdown.terms`, raisons, avertissements).
- Logo inchangé : `client/src/assets/logo.png`, affiché partout par `DaliaLogo.jsx`.
- Palette : encre `--ink-0…5`, os `--bone-0…3` (`--bone-3` = `#8a857a`), rouge de fond `--accent` `#d91e2b`, rouge écrit `--accent-text` `#f23b47`, rouge profond sous texte os `--accent-deep` `#c41a26`, états `--ok` `#9cd36b`, `--warn` `#f5b027`, `--bad` `#ff4d56`, équipe bleue `--blue-team` `#4a8bff`. Aucune autre couleur en dur dans les composants.
- Le rouge signifie : le pick conseillé, l'urgence (chrono ≤ 10 s), ce qui joue contre toi, l'équipe rouge. Le reste est en os.
- Bouton principal : fond os, texte encre, ombre portée rouge 3-5 px. Onglet actif : texte os + soulignement os de 4 px.
- Textes : 11 px minimum pour les libellés, 13 px pour le texte courant. `tabular-nums` sur tous les nombres alignés.
- Focus : anneau os 2 px décalé de 3-4 px, visible sur rouge comme sur noir. Tout élément cliquable est un `<button>` (ou porte `role`, `tabIndex` et clavier).
- `color-scheme: dark`, `prefers-reduced-motion` respecté, aucune `transition: all`.
- Motifs, un sens chacun : trait os 2,5 px = structure ; ombre portée franche 4 px = premier plan ; inclinaison −1° = le choix en cours (un seul à l'écran) ; hachures = estimé, incertain, vide ou périmé ; entaille rouge = en-tête de page ; équerres = là où agir.
- Textes attendus par les parcours Playwright, à conserver à l'identique : `DRAFT`, `POOL`, `REPLAYS` (onglets), `ANALYSER`, `Rechercher un champion` (champ), noms de champions en capitales dans les résultats, `Vider cet emplacement`, libellés d'emplacements `blue mid : vide` / `red P1 : Jarvan IV`, `Comparer deux champions` (summary), `Champion A` / `Champion B`, `Comparer`, titre `X est préféré de N points de win rate`, `WPA indisponible`, `La draft a changé`, `Enregistrer`, `Draft enregistrée dans Replays.`, `Rejouer`, `Étape 1 / 3`, `Étape suivante`, `Tester une variante`, `Améliorer mon pool`, `Identifier les manques`, `Options manquantes :`, `Ajouter au niveau D — à apprendre`.
- Vérification après chaque tâche : `cd client && npx vitest run` puis `PLAYWRIGHT_CHANNEL=chrome npx playwright test`, et capture `playwright-cli` de l'écran touché en 1280×800 (et 900×600 pour la draft).
- Commits en français, terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Fichiers en LF.

## Review Focus

- Noms de champions longs (« Nunu & Willump », « Aurelion Sol ») dans le héros, la shortlist et le bandeau : doivent se réduire ou tronquer sans casser la grille. Test : `heroNameSize` dans `lib/terms.test.js`.
- Scores hors de l'échelle −4…+4 (ex. +6.3 ±2.0) : l'intervalle s'étend, rien ne sort de sa piste. Test : `intervalScale` avec un score extrême.
- Termes inconnus du client (nouveau terme moteur) : affichés dans un groupe « Autres » avec leur nom technique, jamais ignorés. Test : `groupTerms` avec un nom inconnu.
- Recherche de champion avec accents, apostrophes et espaces (« kaisa », « kai'sa », « jarvan », « nunu ») : trouve le bon champion, Entrée prend le premier. Test : `searchChampions`.
- Fenêtre 900×600 : chrono, score et bouton ANALYSER visibles sans défilement. Vérifié par capture `playwright-cli`.

---

## Structure des fichiers

**Créés**
- `client/src/styles/tokens.css` — variables : couleurs, polices, tailles, espacements, z-index, motifs.
- `client/src/styles/base.css` — reset (remplace le preflight Tailwind), focus, sélection, barres de défilement, mouvement réduit.
- `client/src/styles/motifs.css` — `.se-edge`, `.se-lift`, `.se-chosen`, `.se-hatch`, `.se-slash`, `.se-corners`.
- `client/src/styles/components.css` — `.btn*`, `.field`, `.select`, `.check`, `.range`, `.panel`, `.section-lbl`, `.tag`, `.pill`, `.tier`, `.portrait`, `.disclosure`, `.seg`, `.banner`, `.skel`, `.dot`, `.data-table`, `.page-head`.
- `client/src/styles/shell.css` — barre du haut, navigation, chrono, bandeau d'erreur.
- `client/src/styles/draft.css` — bandeau de draft, héros, shortlist, colonne « Pourquoi », termes, barre d'état, recherche.
- `client/src/styles/pages.css` — Pool, Replays, Duo, Paramètres, Connexion, erreur.
- `client/src/lib/terms.js` + `terms.test.js` — familles et libellés des termes, `groupTerms`, `termBar`, `intervalScale`, `intervalGeometry`, `heroNameSize`.
- `client/src/lib/championSearch.js` + `championSearch.test.js` — `normalizeName`, `searchChampions`.
- `client/src/components/Topbar.jsx` — marque, navigation, équipe/rôle, client League, chrono.
- `client/src/components/Draft/DraftStrip.jsx` — bandeau : bans, picks, tour, ANALYSER, recherche de champion.
- `client/src/components/Draft/ChampionSearch.jsx` — dialogue de recherche en liste clavier.
- `client/src/components/Draft/WhyPanel.jsx` — bans conseillés, raisons, termes, lane, interactions de kits, comparaison.
- `client/src/components/Draft/StatusBar.jsx` — état des données, mode, ordre, annuler, nouvelle draft, enregistrer.
- `client/src/components/Draft/ReplayBar.jsx` — navigation dans un replay.
- `client/src/components/Draft/DraftStates.jsx` — avant analyse, squelette, bandeau « périmé ».
- `client/src/components/Draft/DraftScreen.jsx` — assemble l'écran de draft.

**Modifiés**
- `client/src/index.css` — ne contient plus que les imports des feuilles et les animations.
- `client/index.html` — `color-scheme`, `theme-color`, graisses de police 500/600.
- `client/src/main.jsx` — retire `data-accent` / `data-intensity`.
- `client/src/App.jsx` — coquille : barre du haut, bandeau d'erreur, pages.
- `client/src/components/Primitives.jsx` — primitives en classes (Button, Tag, Pill, Portrait, TierBadge, SectionLbl, ReasonItem, TermRow, Interval, LcuStatus, PageHead, Disclosure, Segmented).
- `client/src/components/HeroPanel.jsx` — héros + shortlist à intervalles et groupe de tête.
- `client/src/components/DraftWorkshop.jsx` — ne garde que `ComparePanel` et `MechanicsDetails`, restylés.
- `client/src/components/HistoryPage.jsx` — page Replays fusionnée (stats, liste, résultat, suppression confirmée, import/export).
- `client/src/components/PoolAdvisor.jsx`, `ChampionPool/ChampionPoolEditor.jsx`, `DuoQ/DuoPanel.jsx`, `Settings/SettingsPage.jsx`, `Settings/DraftPreferences.jsx`, `Auth/AuthPage.jsx`, `ErrorBoundary.jsx` — en classes.
- `client/src/lib/scores.js` — retire les helpers Tailwind, `advantageColor` sur les tokens.
- `client/package.json`, `client/postcss.config.js` — sans Tailwind.
- `client/e2e/workflows.spec.js` — seulement si un sélecteur doit suivre la nouvelle structure (les textes restent).
- `docs/BRIEF_REDESIGN.md` — état après refonte.

**Supprimés**
- Code non affiché : `components/DraftBoard/` (7 fichiers), `components/Recommendations/RecommendationPanel.jsx`, `components/Layout.jsx`.
- `components/DraftPanel.jsx` (remplacé par `components/Draft/`), `components/Insights/InsightsPage.jsx` (fusionné dans Replays), `src/workshop.css`, `client/tailwind.config.js`.

---

### Task 1 : Fondations et tokens (lot 0 + lot 1)

**Files:** styles/*.css (créés), index.css, index.html, main.jsx, lib/scores.js, package.json, postcss.config.js, suppressions de code mort, tailwind.config.js.

- [ ] Supprimer le code mort listé ci-dessus ; vérifier par recherche qu'aucun import n'y mène.
- [ ] Retirer Tailwind : `npm uninstall tailwindcss`, retirer le plugin de `postcss.config.js`, supprimer `tailwind.config.js`, remplacer les directives `@tailwind` par `base.css`.
- [ ] Écrire `tokens.css` (palette unique, alias `--text-muted` etc. supprimés), `base.css`, `motifs.css`, `components.css`.
- [ ] `index.html` : `<meta name="color-scheme" content="dark">`, `<meta name="theme-color" content="#08080a">`, polices Oswald 400-700, Inter 400-700 + italique, JetBrains Mono 400-700.
- [ ] `main.jsx` : plus de `dataset.accent` ni `dataset.intensity`.
- [ ] `lib/scores.js` : supprimer les helpers Tailwind inutilisés ; `advantageColor` renvoie `var(--ok)` / `var(--accent-text)` / `var(--bone-2)`.
- [ ] Vitest + Playwright verts ; commit « Refonte : fondations, tokens rouge unique, Tailwind retiré ».

### Task 2 : Logique pure testée (termes, intervalles, recherche)

**Files:** `lib/terms.js`, `lib/terms.test.js`, `lib/championSearch.js`, `lib/championSearch.test.js`.

**Interfaces produites :**
- `TERM_FAMILIES: Array<{ id, label, names: string[] }>` ; `TERM_LABEL: Record<string,string>` ; `TERM_SOURCE_LABEL`.
- `groupTerms(terms) → Array<{ id, label, terms: Array<term & { label, technical, estimated }> }>` — ordre stable des familles et des termes, groupe `autres` pour les noms inconnus, familles vides omises.
- `termBar(value, sd, max = 2) → { side: 'pos'|'neg'|'zero', width, whiskerLeft, whiskerWidth }` en pourcentages de la piste, bornés à [0, 100].
- `intervalScale(picks) → number` : demi-étendue symétrique, au moins 4, arrondie à l'entier supérieur, plafonnée à 10.
- `intervalGeometry(score, sd, scale) → { point, left, width }` en pourcentages bornés.
- `heroNameSize(name) → number` (px) : 68 jusqu'à 8 caractères, puis décroissant jusqu'à 40.
- `normalizeName(s)` : minuscules, sans accents, sans espaces, apostrophes, points ni esperluettes.
- `searchChampions(champions, query, unavailable = new Set(), limit = 8)` : préfixe du nom, puis début de mot, puis sous-chaîne ; exclut `unavailable` ; `[]` si la requête normalisée est vide.

- [ ] Écrire les tests (cas nominaux + Review Focus), les voir échouer, implémenter, les voir passer ; commit.

### Task 3 : Coquille (barre du haut, navigation, erreurs)

**Files:** `components/Topbar.jsx`, `App.jsx`, `styles/shell.css`, `DaliaLogo.jsx`.

- [ ] Barre de 44 px : `DaliaLogo` + DALIA ; `<nav aria-label="Navigation principale">` avec DRAFT, POOL, DUO Q, REPLAYS, PARAMÈTRES (`aria-current="page"`) ; équipe BLUE/RED (bleu = `--blue-team`, rouge = `--accent-deep` + texte os) ; rôle (menu, Échap ferme) ; « 4ᵉ PICK » ; client League (point + libellé) ; chrono à droite avec barre qui se vide (t / 30) ; ≤ 10 s : chrono et barre en rouge.
- [ ] Sélecteur d'accent supprimé. Page Données retirée de la navigation.
- [ ] Bandeau d'erreur ANALYSER : `role="alert"`, bouton « Fermer ».
- [ ] Sous 1100 px : libellés de la marque et du client League masqués ; la navigation défile seule, le chrono reste visible.

### Task 4 : Écran de draft (lots 2 et 3)

**Files:** `components/Draft/*`, `HeroPanel.jsx`, `Primitives.jsx`, `DraftWorkshop.jsx`, `styles/draft.css`.

- [ ] Bandeau (62 px) : 5 bans + 5 picks par équipe, tous des boutons (libellés d'accessibilité inchangés pour les picks, `blue ban 1 : vide` pour les bans), emplacement à remplir marqué d'équerres, centre : tour (mode direct) + ANALYSER (bouton principal ; « RELANCER » si périmé ; « ANALYSE… » pendant le chargement).
- [ ] Recherche : dialogue `role="dialog"`, liste `role="listbox"`, ↑ ↓ Entrée Échap, « Vider cet emplacement » stylé, résultats en capitales.
- [ ] Héros : illustration sans rayures, nom à `heroNameSize`, verdict une fois, score rouge avec ±σ à côté, unité « PTS DE WIN RATE VS TON POOL », P(win) seulement si connu, rappel du groupe de tête.
- [ ] Shortlist : intervalle hachuré par ligne sur `intervalScale`, groupe de tête encadré (bord ambre + libellé), ligne choisie inclinée.
- [ ] Colonne « Pourquoi » : bans conseillés (phase de ban seulement), raisons, termes groupés (`groupTerms`, `termBar`), lane (matchups + synergies), interactions de kits, comparaison (`<details>` stylé).
- [ ] États : avant analyse (pool du rôle, ordre de pick, ANALYSER), squelette hachuré pendant la première analyse, conseils périmés (hachures + scores barrés + bandeau « La draft a changé : relance l'analyse pour actualiser les conseils. » avec RELANCER).
- [ ] Barre d'état : patch, rang lisible (Émeraude+), date des stats, statistiques absentes, source dégradée, WPA estimé/indisponible, attente du client League ; à droite mode, ordre, Annuler, Nouvelle draft, Enregistrer ; messages en `role="status"`.
- [ ] Barre de replay : Étape précédente, « Étape n / N », Étape suivante, Tester une variante.
- [ ] Entrée (sans focus) lance l'analyse sur la page Draft.
- [ ] Captures 1280×800 et 900×600 ; Vitest + Playwright ; commit.

### Task 5 : Pages (lot 4)

**Files:** `HistoryPage.jsx`, `PoolAdvisor.jsx`, `ChampionPoolEditor.jsx`, `DuoPanel.jsx`, `SettingsPage.jsx`, `DraftPreferences.jsx`, `AuthPage.jsx`, `ErrorBoundary.jsx`, `styles/pages.css`.

- [ ] Replays : en-tête à entaille, stats (total, victoires, défaites, win rate, champion, rôle) si au moins une partie, outils (Actualiser, Importer un replay JSON, Exporter la draft actuelle), cartes (portrait, champion · rôle · équipe, résultat en boutons Victoire/Défaite/Remake `aria-pressed`, avantage conseillé, patch, date `Intl`, étapes), Rejouer / Exporter, Supprimer avec confirmation en ligne.
- [ ] Pool : en-tête à entaille, onglets de rôle, état de sauvegarde, conseil de pool en disclosure, niveaux S→D en échelle d'os, boutons ↑ ↓ × toujours visibles avec libellés, recherche étiquetée, bascule Rôle/Tous.
- [ ] Duo : en-tête, code, copier/régénérer avec libellés et confirmation, champ étiqueté, partenaire, rôle en segmenté, ACTIVER `aria-pressed`, couleurs sur les tokens.
- [ ] Paramètres : compte, client League, préférences de draft (cases, liste, curseurs stylés), déconnexion en bouton secondaire.
- [ ] Connexion : libellés reliés (`htmlFor`), bouton principal os, onglets os, entaille et équerres gardées.
- [ ] Erreur critique : tokens.
- [ ] Vitest + Playwright ; captures ; commit.

### Task 6 : Vérification finale

- [ ] `web-design-guidelines` sur les fichiers modifiés ; corriger.
- [ ] Recherche : plus de `var(--text-muted)`, `--surface-`, `transition: 'all`, `#26ff6e`, `data-accent` dans `client/src`.
- [ ] Captures finales de chaque écran ; mise à jour de `docs/BRIEF_REDESIGN.md`.
- [ ] Vitest + Playwright + `npm run build` ; fusion rapide dans `main`.
