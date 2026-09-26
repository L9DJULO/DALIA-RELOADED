# WPA des picks — retirer le biais de sélection du signal méta — spec de conception

Chantier 15. Proposé le 26 septembre 2026 après lecture par le joueur de l'article de Coachless
sur le Win Probability Added (xPetu, co-fondateur de Coachless). Le joueur a demandé la spec ;
aucune décision d'implémentation n'est prise au-delà de la phase 1.

## 1. Le problème

Le signal méta du moteur lit le win rate soloqueue d'un champion. Le chantier 13 a mesuré que ce
win rate **classe à l'envers d'un bon drafteur** : sous le hasard en concordance pro, avec
Amumu support, Karthus bot et Warwick top en tête. Cause identifiée : le win rate d'un champion
peu joué mesure surtout la compétence de ses joueurs dédiés.

C'est exactement ce que décrit l'article :

> WR = effet moyen de la décision + biais de sélection

Le correctif actuel — win rate ramené au quart, plus un terme de popularité (réglage du 24/09) —
fonctionne (calibration 30 → 37/52 sur le gel de l'époque) mais c'est la « règle au jugé » que
l'article critique : il **devine** l'ampleur du biais au lieu de le **mesurer**.

## 2. La méthode, transposée aux picks

Coachless, pour un item : `WPA = WR − moyenne de la probabilité de victoire juste avant l'achat`.
La probabilité « avant » vient d'un modèle calibré qui voit tout ce qui accompagne la décision
(niveau des joueurs, champions, état de la partie) sauf la décision elle-même. La moyenne de cette
probabilité sur les parties où la décision a été prise estime le biais de sélection.

Pour un pick de champion `c` au poste `r` :

```
WPA(c, r) = WR(c, r) − moyenne sur ses parties de P(victoire | X sans c)
```

où `X` contient :

| Facteur de confusion | Donnée | Source |
|---|---|---|
| Force des 9 autres champions | champions par poste des deux équipes | match-v5 (déjà collecté) |
| Niveau des 10 joueurs | rang (palier, division, LP) | league-v4 `entries/by-puuid` |
| Expérience du joueur **sur le champion joué** — l'effet « joueur dédié » | points de maîtrise, date de dernière partie | champion-mastery-v4 `by-puuid/{puuid}/by-champion/{id}` |
| Côté | bleu / rouge | match-v5 (déjà collecté) |

Nuance sur la maîtrise : l'expérience du joueur sur le champion qu'il joue fait partie de `X`.
C'est voulu : on veut l'effet du champion **à expérience égale**, pas l'effet « un one-trick est
aux commandes ». Seule l'identité du champion évalué est masquée.

## 3. Ce qui existe déjà

- **Collecteur** `server/app/ml/collect_matches.py` : joueurs Master+ via league-v4, historiques
  30 jours, détails match-v5, sortie JSONL reprenable. Extrait **uniquement** les 10 champions par
  poste, le vainqueur, la durée et le patch — aucune donnée joueur.
- **Corpus** : 4 282 parties EUW (`app/data/matches/euw1/`), 1 500 joueurs Master+.
- **Modèle** `server/app/ml/model.py` : embeddings de champions par poste, interactions de
  matchup, P(bleu gagne). Entrée : 10 identifiants de champions. Masquage des drafts partielles
  déjà géré (padding nul).
- **Chaîne d'entraînement** : découpage 70/10/10/10 avec test temporel, température calibrée,
  garde-fous d'activation (Brier, log loss, ECE ≤ 0,08, ≥ 200 parties de test). Jamais exécutée
  sur un vrai corpus.
- **« WPA estimé DALIA »** (`docs/WPA_ET_MECANIQUES.md`) : `P(victoire | c, draft)` moins la
  moyenne des alternatives. **Ce n'est pas un WPA au sens de Coachless** — il compare des options
  entre elles sans retirer de biais de sélection — et il n'a jamais été actif, faute de modèle.

## 4. Limites connues avant de commencer

1. **L'ordre de pick n'est pas dans l'API.** match-v5 ne dit pas qui a pické quand ; la demande
   de fonctionnalité correspondante est fermée « not planned ». Le biais « counterpick de dernier
   pick » reste donc non mesuré — l'article prévient que l'estimation suppose qu'aucun facteur
   important n'est oublié. Les termes `matchup` et `future_opponent` du moteur en portent déjà une
   partie.
2. **Le rang et la maîtrise sont lus au moment de la collecte, pas de la partie.** La maîtrise
   inclut les points gagnés pendant et après la partie. Atténuation : collecter les parties
   récentes (moins de 30 jours) et utiliser la maîtrise en échelle logarithmique, où quelques
   parties de plus ne changent presque rien.
3. **Un champion à 100 % sur son poste n'a pas d'effet identifiable** (même limite que l'article).
4. **Le volume.** L'incertitude d'un WPA est d'environ `0,5 / √n` : ±1,6 point à 1 000 parties,
   ±1,0 à 2 500. Avec 10 apparitions par partie, **30 000 parties** donnent de l'ordre du millier
   de parties pour un champion médian sur son poste. Les champions rares resteront incertains et
   seront rétrécis, comme le win rate aujourd'hui (`k_meta`).

## 5. Phase 1 — enrichir la collecte (seule phase décidée)

Rien ne change dans le moteur. Objectif : un corpus qui contient les facteurs de confusion.

### 5.1 Ce que chaque partie doit contenir en plus

Pour chacun des 10 participants, en plus du champion : `puuid` (haché avant stockage, voir 5.4),
palier / division / LP en soloqueue, points et niveau de maîtrise sur le champion joué, date de
dernière partie sur ce champion, et la date de collecte de ces trois valeurs (limite 2).

### 5.2 Coût en appels et cache

Chaque partie coûte 1 appel match-v5, plus au plus 10 appels de rang et 10 de maîtrise. En haut
elo, les mêmes joueurs reviennent sans cesse : le rang se met en cache **par joueur** (valide
24 h), la maîtrise **par (joueur, champion)** (valide 24 h). Le coût réel attendu est bien
inférieur à 21 appels par partie ; il sera mesuré sur les 500 premières parties.

### 5.3 Clé et débit

Aucune clé Riot n'est configurée dans `.env`. Une clé de développement est limitée à 20 appels
par seconde et 100 par 2 minutes, par région, et **expire toutes les 24 heures** — inutilisable
pour une collecte de plusieurs jours sans intervention. Une **clé personnelle** (produit
enregistré sur le portail développeur, sans vérification) garde les mêmes limites mais n'expire
pas. Ordre de grandeur à 100 appels / 2 min, avec le cache : quelques milliers de parties par
jour, donc une à deux semaines pour 30 000. Les régions ont des limites indépendantes : EUW + KR
en parallèle divise la durée.

### 5.4 Données personnelles

Le corpus contient des identifiants de joueurs. Le `puuid` est haché (SHA-256 salé, sel local non
versionné) avant écriture ; le corpus reste hors du dépôt (déjà le cas de `app/data/matches/`).
Seul le hachage sert à relier un joueur à son cache.

### 5.5 Critères de fin de phase 1

- Le collecteur tourne sans surveillance plusieurs jours, reprend après interruption, et ne
  perd pas une partie sur un 429 ou une erreur réseau.
- Chaque partie écrite a ses 10 joueurs enrichis, ou est marquée incomplète et exclue.
- Mesure publiée : appels par partie après cache, parties par jour, répartition par palier.
- Tests unitaires sur l'extraction et le cache, sans réseau (`httpx.MockTransport`).

## 6. Phases suivantes (à décider après la phase 1)

**Phase 2 — modèle « avant le pick ».** Étendre le modèle : par emplacement, le champion (masqué
pour l'emplacement évalué) et les caractéristiques du joueur. Mêmes garde-fous d'activation que
l'existant ; en plus, le modèle doit battre un modèle « champions seuls » en log loss, sans quoi
les données joueur n'apportent rien et le WPA ne corrigera pas le biais « joueur dédié ».

**Phase 3 — WPA par champion et par poste.** Pour chaque apparition, `P(victoire | X sans c)` ;
`WPA = WR − moyenne`, avec écart-type, rétréci par le nombre de parties. Contrôles de bon sens
avant toute intégration : les champions du chantier 13 (Amumu support, Karthus bot, Warwick top)
doivent perdre l'essentiel de leur avance de win rate ; la corrélation WPA / popularité est
publiée pour vérifier qu'on ne mesure pas la popularité par un autre chemin.

**Phase 4 — mise en concurrence.** Le WPA remplace le win rate dans `meta_term`, puis on compare
au signal hybride actuel sur les deux instruments : calibration (gel commun, `--compare`) et
concordance pro. Règle habituelle : ne pas faire perdre de catégorie à la calibration. Le terme
popularité est re-mesuré dans la foulée : s'il ne servait qu'à corriger le biais, son poids
optimal doit baisser.

## 7. Ce que ce chantier ne fait pas

- Pas de données Coachless : aucune API documentée ni source autorisée (voir
  `docs/WPA_ET_MECANIQUES.md`). On reprend la méthode, publiée, pas leurs chiffres.
- Pas de WPA d'items, de runes ou de sorts : DALIA conseille des picks.
- Le « WPA estimé DALIA » existant (comparaison d'options) n'est pas touché ; il sera renommé en
  phase 3 pour ne pas porter le même nom que ce WPA.

## 8. Décisions attendues du joueur

1. **Clé Riot personnelle** : l'enregistrer sur le portail développeur et la mettre dans
   `server/.env` (`RIOT_API_KEY`). Sans elle, la phase 1 ne peut pas tourner.
2. **Régions** : EUW seule (ton serveur) ou EUW + KR (deux fois plus vite, méta proche du haut
   niveau mais population différente) ?
3. **Paliers** : Master+ seulement, comme aujourd'hui, ou à partir de Diamant pour le volume ?
   Le moteur sert tous les rangs ; un WPA mesuré en Master+ vaut surtout pour le haut elo.

## Sources

- Méthode WPA : article de xPetu (Coachless), texte fourni par le joueur le 26/09/2026.
- Limites de débit des clés de développement : [FAQ du portail développeur Riot](https://developer.riotgames.com/docs/faqs),
  [HexDocs — rate limiting](https://github.com/CommunityDragon/HexDocs/blob/master/lol/riotapi/rate-limiting.md).
- Clés personnelles : [Riot Developer Portal — Product Registration](https://developer.riotgames.com/docs/portal).
- Rang par PUUID, `GET /lol/league/v4/entries/by-puuid/{encryptedPUUID}` : [Riot Developer Portal — League of Legends](https://developer.riotgames.com/docs/lol).
- Maîtrise par PUUID, `championPoints`, `championLevel`, `lastPlayTime` : [RiotWatcher — ChampionMasteryApiV4](https://riot-watcher.readthedocs.io/en/latest/riotwatcher/LeagueOfLegends/ChampionMasteryApiV4.html).
- Ordre de pick absent de l'API : [RiotGames/developer-relations#192](https://github.com/RiotGames/developer-relations/issues/192), fermé « not planned ».
