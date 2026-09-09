**Suivi :** les correctifs de cette reprise et leurs vérifications sont décrits dans [REPRISE_PROJET.md](REPRISE_PROJET.md). Le constat ci-dessous reste celui du checkout initial.

**DALIA — bilan de reprise du 9 septembre 2026**

Mon avis : conserver la stack et l'identité visuelle, puis consacrer la première reprise à rétablir un parcours de draft complet et fiable. Le projet possède déjà beaucoup de logique métier ; son principal problème est le décalage entre cette logique, l'interface actuelle et les garanties apportées aux chiffres affichés.

Audit du commit `f664423`. Les observations concernent ce checkout, pas l'état du serveur déployé. Aucun correctif applicatif ni déploiement effectué pendant cette passe.

**Périmètre et contrôles effectués**

Lecture des parcours React/Zustand, du connecteur Rust/LCU, des routes FastAPI, de l'authentification, des modèles et migrations SQL, du moteur de scoring, des caches et sources de données, de l'entraînement/prédiction ML, des scripts de collecte/déploiement et des suites d'évaluation. Le dossier `DALIA DESIGN/react-export` constitue une autre base d'interface à distinguer du client livré.

| Contrôle | Résultat et portée |
|---|---|
| Installation frontend | `npm ci --ignore-scripts --no-audit --no-fund` réussit : 176 paquets installés, lockfile conservé. |
| Build frontend | `npm run build` réussit : 1 522 modules transformés, environ 11 secondes. Cela ne valide pas les parcours utilisateur. |
| Syntaxe Python | Analyse AST de 52 fichiers Python : aucune erreur de syntaxe. |
| Audit npm | 13 paquets signalés : 6 high, 5 moderate, 2 low, 0 critical. Inclut outils de développement et dépendances transitives ; leur exploitabilité dans DALIA reste à qualifier. |
| Reproductions JavaScript | Exécution du code des stores/adaptateur avec Zustand réel, réseau et temporisateurs simulés : contamination du pool après déconnexion forcée, P(WIN) artificiel, ordre de pick absent et réponse obsolète confirmés. |
| Reproduction ML | Sur 100 matchs synthétiques et le split du projet, 28 des 30 exemples de validation ont leur version inversée dans l'entraînement. Ce chiffre décrit le test synthétique, pas les données de production. |
| Reproductions caches | Avec HTTP simulé : version DDragon figée malgré expiration du cache disque ; chargement vide de méta retenu comme terminé. Dans un répertoire temporaire : écriture JSON hors du sous-dossier de cache via le PUUID. |
| Rust | `cargo check --locked --offline` bloqué : `tauri-build` 2.6.1 du lockfile absent du cache local. Ce n'est pas une erreur de compilation démontrée. |

Pas de partie LoL réelle, de validation visuelle interactive, de connexion à la base de production ou d'entraînement du modèle réel. PostgreSQL/Docker n'étaient pas disponibles comme environnement de test prêt à l'emploi ; SQLAlchemy manque dans le Python local. Les suites calibration et concordance, qui dépendent de données externes et de caches non figés, n'ont pas été exécutées intégralement. Les métriques de qualité réelle du moteur restent donc à établir.

**Ce qui mérite d'être conservé**

- La recommandation adaptée au pool personnel : c'est une direction produit plus intéressante qu'une simple tier list.
- La séparation backend central / connecteur LoL local : le serveur n'a pas besoin d'accéder au client du joueur.
- Les explications de matchup, de synergie et de composition, déjà structurées dans l'API.
- L'inférence probabiliste des rôles ennemis, plus pertinente qu'une attribution systématique par ordre de sélection.
- Les cas de calibration et de concordance existants : une bonne matière première pour protéger le moteur.
- Les bases d'authentification, de droits administrateur et de filtrage de l'historique par utilisateur sont présentes.

**À traiter avant une nouvelle diffusion**

**1. Secret JWT versionné et valeur de secours connue — priorité haute.**

Le Compose racine contient un secret JWT en clair et `server/app/config.py:59` accepte une valeur de secours publique. Si une instance utilise l'une de ces valeurs, la signature des jetons ne constitue plus une protection suffisante. La configuration de production effective n'a pas été vérifiée.

Action : sortir le secret du Compose, générer une valeur propre à chaque environnement et refuser de démarrer en production avec une valeur absente ou de démonstration. Remplacer tout secret déjà utilisé depuis cette configuration. Limiter l'exposition de PostgreSQL, actuellement publiée sur `5432` avec les identifiants de développement. Ne pas recopier le secret dans des tickets ou des logs.

**2. Le PUUID sert directement de chemin de fichier — priorité haute.**

Dans `server/app/services/personal_stats.py:287` et `:302`, le nom du cache est construit avec les 16 premiers caractères du PUUID. Les schémas acceptent une chaîne quelconque. Le service est aussi appelé depuis la recommandation anonyme lorsqu'un PUUID est fourni.

Reproduction locale : avec un cache dans un dossier temporaire, `_save_disk_cache('../escaped', ...)` crée `escaped.json` dans le dossier parent. L'étendue d'une exploitation HTTP dépend du chemin, des permissions et de l'accès au chemin de sauvegarde ; aucune exploitation du serveur n'a été tentée.

Action : valider l'identifiant, construire le nom avec un hash de `(puuid, région, queue, count)` et vérifier que le chemin final reste sous le dossier attendu. Cela règle aussi le fait que le cache actuel ignore la queue et le nombre de matchs demandés.

**3. Dépendances et protections de l'application — priorité haute avant partage.**

L'audit npm signale notamment Axios, Vite et PostCSS, ainsi que des dépendances transitives. Corriger par petits lots avec rebuild et tests des parcours ; une mise à jour majeure peut être nécessaire pour certains correctifs. Les dépendances Python et Rust doivent faire l'objet de leur propre audit : elles n'ont pas reçu un bilan de vulnérabilités complet ici.

`client/src-tauri/tauri.conf.json` désactive la CSP ; l'API autorise toutes les origines CORS. Le code examiné ne montre pas de limitation de débit applicative sur login/register ou les recommandations publiques ; une protection au niveau du proxy reste possible mais non vérifiée. Définir une CSP adaptée aux images Riot et à l'API, restreindre les origines et borner les opérations coûteuses. La [documentation Tauri sur la CSP](https://v2.tauri.app/security/csp/) explique les protections et leur configuration.

**Les problèmes qui touchent directement une session de jeu**

**4. Connexion LCU active, tableau de draft non synchronisé — priorité haute.**

`client/src/App.jsx:336` démarre le polling de `lcuStore`. Celui-ci remplit son propre état, mais aucun appel de l'application à `getDraftSyncData` ou `setFromLCU` ne transfère les picks, bans, côté et rôle vers `draftStore`. Le tableau courant lit justement `draftStore`. Les événements émis par Rust ne sont pas abonnés côté React non plus.

Conséquence attendue du code : le badge et le timer peuvent montrer une connexion, alors que le tableau utilisé par ANALYSER reste manuel. Constat de branchement statique, à confirmer ensuite avec une vraie champion select.

Action : un seul contrôleur de session qui applique un snapshot LCU atomiquement, charge les champions, gère entrée/sortie de champion select et respecte un mode manuel explicite. Vérifier une connexion en cours de draft, un dodge, une reconnexion et une seconde partie.

**5. Impossible de corriger un pick ou un ban dans le tableau actuel — priorité haute.**

`client/src/components/DraftPanel.jsx:277` et `:282` quittent immédiatement le handler si le slot est rempli. Le bouton de remise à zéro est dans l'ancien `DraftBoard`, qui n'est plus monté par `App`.

Action : proposer remplacer/supprimer sur chaque slot, ajouter « Nouvelle draft » et annuler la dernière action. Un mauvais clic ne doit pas imposer de relancer l'application. Afficher les ennemis comme P1–P5 tant que leurs rôles ne sont pas connus : le tableau les étiquette aujourd'hui TOP/JGL/MID/ADC/SUP à partir de leur index, alors que le payload laisse leurs rôles inconnus.

**6. L'analyse perd l'ordre de pick et les options duo/poids — priorité haute.**

Le bouton courant appelle `getRecommendations([], {})` dans `DraftPanel.jsx:355`. Le pool est récupéré via le store, mais les poids personnels ne le sont pas et aucun `duoOptions` n'est envoyé. L'ancien `DraftBoard` construisait ces options. En outre, `draftStore.buildDraftState()` omet `my_pick_order`, donc le serveur conserve la valeur par défaut `1` de `server/app/models/draft.py:37`, alors que le moteur utilise ce champ pour pondérer les recommandations.

Action : centraliser la construction de la requête avec le pool, les préférences, le rôle du duo et la position réelle du joueur. Prévoir un sélecteur d'ordre en mode manuel. Test d'acceptation : les payloads des premier et cinquième picks diffèrent, et activer le duo ajoute bien ses paramètres.

**7. Des chiffres présentés comme probabilités sont fabriqués par l'interface — priorité haute.**

`client/src/data/mock.js:129` calcule `winProb` avec une moyenne des win rates des matchups, ou `40 + score × 0.18`. `HeroPanel.jsx:83` présente ensuite ce chiffre comme `P(WIN)`. L'adaptateur courant ignore la probabilité ML fournie par le backend.

Reproduction : une recommandation de score 90, sans modèle ni matchup, affiche 56,2 %. Ce n'est pas une probabilité de victoire mesurée. Le nom `mock.js` est trompeur : ce fichier contient bien un adaptateur utilisé en production, pas seulement des données de démonstration.

Action : afficher seulement une probabilité issue du champ ML documenté, avec son état de disponibilité ; sinon afficher « indisponible ». Garder un score d'adéquation distinct. Les valeurs « FIABLE » et les intervalles ± doivent aussi être décrites comme heuristiques tant qu'ils ne sont pas validés statistiquement. Le backend construit actuellement `score_range` autour du sous-score ML puis le joint au score composite : ces deux grandeurs ne sont pas interchangeables.

**8. Réponses d'analyse obsolètes — priorité haute.**

Dans `draftStore.js:229`, chaque réponse est appliquée sans vérifier la session ou l'état de draft qui l'a produite. Reproduction : démarrer une analyse, appeler `resetDraft`, puis résoudre la requête ; les anciennes recommandations réapparaissent. Changer le rôle pendant une analyse pose le même problème. Les recommandations déjà présentes ne sont pas marquées périmées quand le tableau change.

Action : associer chaque analyse à un identifiant de session et une révision de draft ; ignorer les réponses dépassées et annuler les requêtes inutiles. Afficher « Analyse à actualiser » après une modification.

**9. Le pool peut passer d'un compte à un autre — priorité haute.**

Le chemin de déconnexion volontaire des paramètres nettoie le pool, mais celui d'une réponse HTTP 401 ne fait que notifier `authStore` et `duoStore`. `userStore` ne s'abonne pas à cet événement. Sa persistance n'est pas indexée par utilisateur ; `loadProfile()` renvoie automatiquement le pool local lorsqu'un compte a un pool serveur vide (`userStore.js:56`).

Reproduction avec les stores réels : après déconnexion forcée, Ahri reste dans le pool ; le chargement d'un autre profil vide déclenche un upload d'Ahri. Les temporisateurs de sauvegarde doivent également être annulés dans ce parcours.

Action : une déconnexion commune pour toutes les causes, des caches associés à l'ID utilisateur et aucune migration automatique vers un compte différent. Ajouter un état visible « enregistré / en attente / erreur » : les échecs de sauvegarde actuels sont seulement envoyés à la console, supprimée du build de production.

**10. Images, historique et paramètres : fonctionnalités partiellement débranchées — priorité moyenne.**

Les icônes du tableau utilisent `14.8.1` et celles de l'adaptateur `14.24.1`, malgré un helper de version dynamique existant. Les champions absents de ces versions auront des images manquantes. Employer la même source d'URL partout et un fallback d'image.

`InsightsPage` et la sauvegarde via l'ancien `DraftBoard` existent mais ne sont pas accessibles depuis la navigation courante. Les réglages ML décrits dans le README ne sont pas dans l'actuelle page Paramètres. Enfin `main.jsx:7` impose le rouge au démarrage avant la lecture du thème enregistré.

Action : établir la liste des fonctionnalités réellement livrées, reconnecter celles qui comptent et mettre le README en accord. Supprimer les anciens composants seulement après récupération des comportements utiles.

**Données et moteur IA**

**11. Les caches mémoire empêchent les mises à jour — priorité haute.**

`get_ddragon_version()` conserve indéfiniment `_ddragon_version` (`data_fetcher.py:101`). Le watcher rappelle cette méthode mais obtient toujours la valeur initiale. Les caches de méta (`meta_analyzer.py:47`) et de matchup (`matchup.py:50`) n'expirent pas non plus. Le TTL disque de six heures ne résout pas ces retours précoces.

Reproductions : deux lectures de version avec un cache disque déjà expiré produisent un seul appel HTTP ; une réponse méta vide marque le rôle comme chargé et empêche une nouvelle tentative.

Action : versionner les caches par patch et paramètres, donner un TTL aux caches mémoire, invalider ensemble champions/méta/matchups et distinguer réponse vide et chargement réussi. Montrer patch, date de collecte, taille d'échantillon et mode dégradé.

**12. Fuite entre entraînement et validation — priorité haute.**

`DraftDataset` ajoute pour chaque match sa version avec équipes inversées (`model.py:68`). `train.py:122` charge ce jeu augmenté avant le `random_split` de la ligne 132. Deux variantes d'une même observation peuvent donc être réparties de part et d'autre. La reproduction sur données synthétiques confirme le mécanisme ; l'ampleur du biais sur le modèle réel n'est pas mesurée.

Action : dédupliquer par `match_id`, séparer les matchs avant augmentation et réserver un test sur des dates/patchs ultérieurs. Augmenter seulement l'entraînement. Comparer à une baseline simple avant de modifier l'architecture. Voir les [précautions scikit-learn sur les fuites de données](https://scikit-learn.org/stable/common_pitfalls.html#data-leakage).

**13. Calibration et drafts incomplets à réévaluer — priorité moyenne, après le split.**

La température est fixée à `5.0` et l'explication annonce `~60%` en dur (`predictor.py:178` et `:284`). Le dataset d'entraînement rejette les slots inconnus, alors que la prédiction traite des drafts incomplets. L'initialisation aléatoire réécrit aussi le vecteur de padding : 32 coordonnées non nulles constatées pour le champion 0.

Action : apprendre la calibration sur un jeu distinct, publier les métriques du modèle effectivement chargé, tester chaque niveau de complétude et entraîner avec un masquage des picks correspondant aux situations d'utilisation. Mesurer log loss, Brier et courbes de calibration ; l'accuracy seule ne suffit pas à juger les probabilités. La [documentation sur la calibration](https://scikit-learn.org/stable/modules/calibration.html) précise ces distinctions.

La concordance avec les pros peut servir de repère, mais ne démontre pas l'utilité en SoloQ. Les seuils « niveau coach humain » du README de concordance ne sont pas établis par une mesure comparative dans ce dépôt.

**14. Le réentraînement automatique ne garantit pas un modèle à jour — priorité moyenne.**

Le watcher relance l'entraînement sur le fichier existant sans collecter les matchs du nouveau patch, puis enregistre le patch courant comme entraîné. Sa sortie est envoyée vers `subprocess.PIPE` sans consommateur : risque de blocage si le pipe se remplit. La fin d'entraînement ne recharge pas automatiquement le modèle. Si le moteur a démarré sans modèle, `engine.ml` vaut `None` et le reload actuel ne le recrée pas.

Les Dockerfiles excluent aussi les données et modèles du contexte ; le Compose complet ne monte pas un stockage de modèles dédié. Un checkout neuf ne reproduit donc pas une installation avec ML opérationnel.

Action : distinguer collecte, validation du dataset, entraînement, évaluation et activation du modèle. Garder le modèle précédent, écrire l'artefact atomiquement, lire les logs du processus et activer explicitement un candidat validé. Ajouter un manifeste : patches réellement présents, nombre de matchs, paramètres, métriques et version du code.

**15. Trop de travail externe dans la requête de draft — priorité moyenne.**

Le moteur attend les statistiques personnelles avant de scorer (`draft_engine.py:227`). Celles-ci peuvent demander 50 détails de matchs en série, avec attente en cas de quota. Le scoring parcourt aussi les candidats séquentiellement et charge leurs matchups à la demande. Le client abandonne après 30 secondes.

Action : précharger les données utiles avant le tour du joueur, rafraîchir les statistiques personnelles en arrière-plan et limiter la concurrence des accès externes. Mesurer la latence à froid et à chaud avant de choisir un objectif ; une première cible produit pourrait être une réponse en moins de deux secondes avec cache chaud. Centraliser les quotas Riot entre collecte et stats personnelles.

**Backend et exploitation**

**16. Santé trompeuse et migrations non garanties — priorité haute pour la reprise du service.**

`server/app/main.py` ne lance qu'une tentative d'initialisation et `/health` répond toujours 200. Railway utilise précisément ce chemin. Une panne de base au démarrage laisse les services non prêts sans nouvelle tentative ; une réponse DDragon vide peut au contraire mener à `ready=True` avec zéro champion. `/ml/status` lit directement un watcher potentiellement absent, contrairement aux routes protégées par `_require_ready`.

`create_all()` crée les tables absentes mais ne met pas une table existante au niveau des migrations. Le script de mise à jour natif applique certaines migrations, mais le démarrage Docker ne le fait pas.

Action : séparer liveness et readiness, vérifier les données minimales, réessayer les erreurs transitoires, lancer les migrations explicitement avant service et rendre l'échec visible. Prévoir une sauvegarde et un test de restauration de la base.

**17. Validation d'entrée et conflits en base — priorité moyenne.**

Le schéma accepte un rôle inexistant, un ordre de pick négatif, six ennemis identiques et des poids négatifs : reproduit localement. Les bornes de `count`, des pools et de l'historique sont également à préciser. Utiliser des enums/Literal, des bornes et des validations croisées : cinq picks maximum par équipe, IDs valides et uniques, cohérence des bans et rôles, poids finis et autorisés.

Dans `auth_routes.py:32`, la recherche username OU email est consommée avec `scalar_one_or_none()`. Si le username appartient à A et l'email à B, deux lignes peuvent être trouvées et produire une erreur 500 au lieu d'un conflit. Les inscriptions concurrentes nécessitent aussi de gérer `IntegrityError`.

Pour le duo, la contrainte unique porte sur une paire, pas sur l'appartenance d'un joueur à un seul duo actif. Deux requêtes concurrentes peuvent créer des liens incompatibles. Prévoir une transaction avec verrouillage cohérent ou un modèle d'appartenance garantissant cette unicité.

**18. Reprise et livraison difficiles à reproduire — priorité moyenne.**

Le guide Windows suppose une VM Linux particulière ; le script d'auto-update possède un chemin utilisateur en dur et déploie directement `main` avec `git reset --hard`, sans validation ni rollback automatique. Le README affirme que le backend tourne déjà, ce qui n'est pas vérifié ici. Il n'y a pas de pipeline CI versionné ni de commande frontend de tests/lint.

Action : documenter un démarrage local Windows et un démarrage conteneur, fixer une version Node, rendre les dépendances Python reproductibles, automatiser build et tests critiques, puis livrer des versions identifiées avec un contrôle de readiness et un retour arrière. Conserver une procédure de récupération des modèles et de la base.

**Idées produit qui donneraient une direction à DALIA**

| Idée | Bénéfice concret | Première version raisonnable |
|---|---|---|
| Trois choix expliqués | Décider vite sous le timer | « Le plus confortable », « Le meilleur contre cette draft », « L'alternative sûre », chacun avec une raison et un risque. |
| Comparer deux champions | Comprendre un arbitrage personnel | Sélectionner Ahri et Orianna et expliquer les différences de lane, synergie, dégâts et maîtrise, avec source des données. |
| Construire son pool | Utile entre les parties | Repérer les trous du pool : blind pick, dégâts AP/AD, anti-tank ; suggérer un seul champion à apprendre avec la raison. |
| Rejouer une draft | Apprendre et tester le moteur | Importer une session enregistrée, avancer pick par pick et voir quand la recommandation change. Réutiliser ces sessions en tests. |
| Débrief après partie | Boucle de retour concrète | Enregistrer recommandation, choix réel, résultat, patch et modèle ; permettre « recommandation utile / mauvaise hypothèse ». Ne pas attribuer automatiquement la victoire au conseil. |
| Démarrage guidé et mode démo | Essayer sans configuration lourde | Choisir rôle et cinq champions, lancer une draft d'exemple, puis connecter LoL. Les endpoints de draft acceptent déjà l'anonyme. |
| État des données lisible | Savoir quand suivre le conseil | Patch, âge, échantillon, rôle ennemi incertain, IA disponible ou non ; conseils heuristiques explicites en mode dégradé. |

La première proposition de valeur à viser : **« Parmi les champions que je sais jouer, lesquels conviennent le mieux à cette draft, et pourquoi ? »** Elle exploite le travail existant et se teste avec de vraies sessions.

**Ordre de reprise proposé**

| Lot | Travail | Critère de sortie |
|---|---|---|
| 1 — Parcours utilisable | Synchronisation LCU, correction/reset des slots, état périmé, payload duo/ordre/poids, séparation score/probabilité, nettoyage de session | Deux champion selects successives et un changement de compte ne mélangent aucun état ; chaque analyse correspond au tableau visible. |
| 2 — Service fiable | Secrets/cache de fichiers, dépendances, validation d'entrée, migrations/readiness, TTL mémoire et fraîcheur visible | Démarrage depuis une base neuve, reprise après panne temporaire, rafraîchissement au changement de patch et sauvegardes vérifiés. |
| 3 — Qualité mesurable | Split avant augmentation, test temporel, calibration, baseline, snapshots de données, activation maîtrisée des modèles | Rapport reproductible par rôle et phase de draft ; aucune partie commune entre train et test ; probabilité absente si non validée. |
| 4 — Valeur utilisateur | Top 3 expliqué, comparaison de deux picks, replay et débrief | Quelques utilisateurs peuvent terminer plusieurs sessions et donner un retour exploitable sur les décisions proposées. |

Avant toute nouvelle diffusion, fermer les points de sécurité 1–3, même si les lots fonctionnels avancent en parallèle dans le temps.

Les premiers tests durables à ajouter sont des tests de parcours : changement de compte après 401, snapshot LCU vers payload, modification pendant analyse, indisponibilité des données, rafraîchissement de patch et séparation des matchs ML. Les scénarios de scoring doivent utiliser des snapshots figés ; la disponibilité des services externes se teste séparément.
