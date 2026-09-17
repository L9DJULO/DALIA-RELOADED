# DALIA 2.1 — bilan des correctifs du 9 septembre 2026

Les correctifs sont implémentés dans le checkout local, avec les trois fonctionnalités retenues et un premier moteur d'interactions de compétences. Aucun déploiement, commit ou push n'a été effectué. L'[audit initial](AUDIT_PROJET.md) reste le constat historique du commit `f664423` ; ce document décrit les changements qui suivent.

## Fonctionnalités livrées

- **Comparer deux champions** depuis la draft : mêmes préférences et contexte, tableau des critères, score final, raisons, limites des interactions et échantillon méta. Une modification de draft ou de préférences invalide la comparaison.
- **Améliorer son pool** depuis l'éditeur : capacités manquantes par rôle, champions complémentaires, plan d'apprentissage et ajout au niveau D. Il s'agit de recommandations de couverture stratégique, pas d'une promesse de progression en win rate.
- **Rejouer une draft** : sauvegarde de la session, historique des états, import/export JSON validé, avance/recul sans révéler les futurs picks, analyse de l'étape visible et création d'une variante indépendante. Le résultat de partie peut être renseigné. Les anciennes entrées sans timeline restent consultables mais ne deviennent pas artificiellement des replays.
- **Interactions de kits** : dashs interruptibles pour Poppy, Wither de Nasus contre certains carries et limites face au peel, esquive des attaques de Jax/Nilah, mobilité entravée par Cassiopeia, bouclier de Morgana, projections alliées pour Yasuo, autres règles ciblées. Chaque règle a une explication, une limite et une source.
- **WPA estimé DALIA** : pipeline de calcul conditionnel intégré au score, avec référence explicite et effet borné. Il reste indisponible sans modèle validé et contexte suffisant. Aucune API Coachless n'est connectée. La [méthode détaillée](docs/WPA_ET_MECANIQUES.md) explique cette distinction et les données nécessaires.

## Couverture des 18 points de l'audit

| Point | Correctif dans le code | Limite ou contrôle restant hors checkout |
|---|---|---|
| 1. Secrets et PostgreSQL | Secret retiré du Compose, génération privée, refus des valeurs absentes/courtes/de démonstration et des deux anciennes valeurs connues par empreinte ; ports Compose locaux. | Remplacer les secrets effectivement utilisés sur les instances existantes. L'historique Git reste sensible. |
| 2. Cache PUUID | Validation et noms SHA-256 incluant contexte ; écritures JSON atomiques. | Aucune inspection du système de fichiers distant. |
| 3. Dépendances et protections | Mises à jour npm/Python/Rust, Argon2 avec migration des anciens hash bcrypt, PyJWT, CSP, CORS restreint, limites de corps/de débit/de concurrence. | Avertissements transitifs Rust décrits ci-dessous ; contrôler la configuration du proxy réel. |
| 4. LCU et tableau | Contrôleur unique, snapshots atomiques, polling sans chevauchement, ordre issu des actions LCU, échanges de champions pris en compte, mode manuel respecté. | Tester connexion tardive, dodge, reconnexion et seconde partie dans League réel. |
| 5. Correction de draft | Remplacement/suppression des slots, annulation et nouvelle draft ; ennemis P1–P5 tant que les rôles sont incertains. | Validation utilisateur en situation de timer. |
| 6. Payload incomplet | Construction centralisée avec ordre, pool, poids, options et contexte duo/personnel. Préférences reconnectées. | — |
| 7. Probabilités fabriquées | Suppression du calcul frontend et des intervalles artificiels ; score distinct de P(victoire), erreurs d'inférence sans faux 50 %. | Modèle réel à entraîner et évaluer. |
| 8. Réponses obsolètes | Annulation et garde de révision sur draft, rôle, préférences, comparaison et reset. Indicateur d'analyse périmée. | — |
| 9. Mélange des comptes | Déconnexion commune, cache de pool par compte, réponses tardives ignorées pour pool/duo/historique, sauvegardes sérialisées et statut visible. | — |
| 10. Fonctions débranchées | Navigation replays/insights, paramètres de scoring, images sur version DDragon commune, accent persisté. | Les anciens composants non montés restent à distinguer du parcours livré. |
| 11. Caches figés | TTL mémoire, actualisation patch/catalogue, nouveau chargement après réponse vide, statistiques invalides rejetées, date/échantillon/fenêtre exposés. Fin du mélange de fenêtres statistiques qui se recouvrent. | La disponibilité et la qualité des fournisseurs restent externes. |
| 12. Fuite ML | Déduplication et split des matchs originaux avant masquage ; test temporel séparé et manifeste des IDs. | Réévaluer les anciens modèles : ils ne passent plus la validation actuelle. |
| 13. Calibration | Partition dédiée, température mesurée, padding nul, métriques par complétude, baseline et garde d'activation. | Calibration par rôle/rang et gain réel à établir avec le corpus récent. |
| 14. Réentraînement | Nouveau corpus du patch requis ; candidat séparé, logs consommables, contrôle du patch, reload effectif, remplacement atomique et sauvegarde du précédent. Volumes de données/modèles. | Collecte Riot réelle et modèle accepté non fournis dans le checkout. |
| 15. Latence | Stats personnelles en arrière-plan, accès externes bornés, circuit de temporisation après panne, délai de recommandation limité, budget Riot partagé entre processus locaux. | Latence à froid/chaud sur réseau réel à mesurer ; limiteur externe si plusieurs hôtes. |
| 16. Disponibilité et migrations | Alembic avant service, liveness/readiness distinctes, vérification DB/catalogue et réessais avec nettoyage des ressources. | Sauvegarde/restauration de la production à répéter sur une base de restauration dédiée. |
| 17. Entrées et conflits | Schémas bornés/cohérents, IDs catalogue canoniques, conflit d'inscription 409, verrouillage des modifications de pool et invariant PostgreSQL de duo unique. | Migration 003 refuse les duos incompatibles préexistants pour permettre leur résolution explicite. |
| 18. Reprise/livraison | Node 24, requirements verrouillés, commandes Windows/Compose, CI versionnée, build Windows, auto-update volontaire avec checkout de validation et retour au code précédent. | Workflow hébergé, image Docker et déploiement/rollback réels non exécutés ici. |

## Vérifications locales

| Contrôle | Résultat |
|---|---|
| Serveur | **46 tests passent**, dont 3 tests d'intégration sur PostgreSQL 16 temporaire. Deux avertissements de dépréciation proviennent des dépendances TestClient. |
| Base | Migrations 001 → 002 → 003 sur base neuve ; comptes isolés, sauvegarde de replay idempotente et duo concurrent testés avec PostgreSQL réel. |
| Frontend | **14 tests Vitest passent** : sessions, réponses tardives, sauvegardes, payload, LCU, replays et affichage des chiffres. |
| Navigateur | **3 parcours Playwright passent** : édition/analyse/comparaison, conseil de pool, sauvegarde/relecture/variante. API et images simulées ; interface inspectée visuellement. |
| Build web | Build Vite de production réussi. |
| Windows | Compilation Rust et test du parser LCU réussis ; recompilation et test réussis après les mises à jour de dépendances. SDK Microsoft officiel utilisé localement, sans installation globale. |
| Entraînement | Exécution d'une époque sur 200 matchs **synthétiques** : candidat écrit, métriques 4/6/8/10 disponibles, candidat refusé et ancien artefact préservé. Ce test ne mesure pas la qualité de jeu. |
| Audits | npm et requirements Python : aucune vulnérabilité connue détectée lors des contrôles. Rust : vulnérabilités bloquantes corrigées ; avertissements restants ci-dessous. |

Les installations et binaires temporaires de vérification sont dans `.tools`, ignoré par Git. Les modèles de test utilisent des répertoires temporaires ; aucune donnée de production n'a été utilisée.

## Avertissements Rust conservés avec leur portée

Après mise à jour de h2, plist/quick-xml, quinn-proto, rustls-webpki, anyhow et des branches rand compatibles, `cargo audit` ne signale plus de vulnérabilité bloquante. Il reste des avertissements de maintenance pour `fxhash`, `proc-macro-error` et cinq composants `unic-*`, ainsi que deux avertissements de sûreté :

- `glib 0.18.5` appartient à la pile Linux/GTK du lockfile ; le client validé ici est Windows. Une distribution Linux nécessite une revue propre à cette pile.
- `rand 0.7.3` est amené par le générateur PHF de Tauri. L'avis requiert notamment la fonctionnalité `log` et un logger réentrant ; `cargo tree -e features --target x86_64-pc-windows-msvc` montre que `log` n'est pas activée dans ce graphe. L'avertissement n'est pas masqué dans la CI.

Ces dépendances restent à suivre avec Tauri ; « aucun avis bloquant » ne signifie pas « aucune dette de dépendance ».

## Prochaine validation utile

Une fois la configuration locale lancée selon le [README](README.md), jouer une vraie sélection en direct, enregistrer la draft et vérifier dans Replays les étapes auxquelles un conseil semble discutable. Ces cas permettront de revoir les règles et leur pondération. Avant diffusion, il reste la rotation des secrets de l'instance, une restauration de sauvegarde testée et le contrôle du déploiement réel. L'utilisation des données Coachless nécessite encore une source autorisée et compatible avec les décisions de draft.

## Passe de relecture du 10 septembre 2026

Relecture du commit de reprise avec correctifs. Les points ci-dessous n'apparaissaient pas dans l'audit initial.

| Problème constaté | Correctif |
|---|---|
| Le client League fournit la région sous forme courte (`EUW`, `NA`, `EUNE`) alors que les schémas n'acceptaient que les identifiants de plateforme (`EUW1`) : toute analyse échouait en 422 dès que League était connecté. | Normalisation des alias de région à la validation ; test paramétré. |
| Limiteur de débit indexé sur l'adresse de connexion alors que uvicorn ignorait les en-têtes de proxy : derrière Railway ou Tailscale Funnel, tous les utilisateurs partageaient 15 connexions/min et 60 analyses/min. | `FORWARDED_ALLOW_IPS` (détection automatique sur Railway), rejet anticipé des corps trop volumineux annoncés par `Content-Length`. |
| Un rafraîchissement méta vide après expiration du TTL effaçait les statistiques précédentes : tout le rôle passait en « inconnu ». | L'échantillon précédent est conservé, nouvelle tentative après dix minutes, un seul chargement concurrent par rôle. |
| Le disjoncteur Lolalytics se déclenchait pour un simple 404 (champion inconnu de la source) et bloquait toutes les requêtes pendant trente secondes. | Seuls les pannes réseau, 429 et 5xx ouvrent le circuit. |
| Changer le résultat d'une partie depuis Replays écrasait les notes avec une chaîne vide. | `notes` optionnel dans la mise à jour ; conservé si absent. Test d'intégration. |
| La liste de l'historique renvoyait toutes les timelines (jusqu'à 100 étapes par entrée). | Liste allégée avec `timeline_steps` ; `GET /api/history/{id}` charge une entrée complète à la demande. |
| Un identifiant de champion périmé dans un pool enregistré faisait rejeter toutes les analyses du compte, sans moyen de le retirer depuis l'éditeur. | Les entrées inconnues sont ignorées dans les pools (les identifiants du tableau restent rejetés) ; l'éditeur affiche une carte « inconnu » supprimable. |
| La comparaison duo chargeait le pool partenaire sans le rôle, donc le bonus n'était jamais appliqué ; une erreur SQL faisait un 500. | Contexte de compte partagé entre recommandation et comparaison, avec dégradation contrôlée. |
| Contrôle de migration codé en dur sur `003`. | Tête calculée depuis le répertoire Alembic. |
| Le modèle ML pouvait être remplacé ou retiré par le watcher au milieu d'une analyse. | Prédicteur capturé une fois par analyse. |
| Un entraînement planté consommait le jeu de données et interdisait toute nouvelle tentative sur les mêmes matchs. | L'empreinte n'est enregistrée qu'après une évaluation complète. |
| Le watcher rechargeait le catalogue et vidait les caches au premier passage après chaque démarrage. | Seul un changement de patch réel déclenche ce rechargement. |
| Stats personnelles : pause morte de 1,2 s tous les quinze matchs et nouvelle requête Riot à chaque analyse après un échec (clé invalide, panne). | Quota confié à `RiotBudget` ; échec mémorisé une minute ; aucune tâche de fond sans clé ou avec cache frais. |
| Wildcards évalués un par un ; matchups cross-lane chargés séquentiellement. | Lots parallèles de cinq candidats ; préchargement parallèle des pages nécessaires par draft. |
| Toute modification du tableau (y compris un survol allié transmis par League) annulait l'analyse en cours sans message : en lobby actif, ANALYSER ne rendait jamais de résultat. | Seule une nouvelle session (nouvelle draft, replay, déconnexion) annule une requête ; sinon le résultat est appliqué et marqué « à actualiser ». |
| Synchronisation League avant l'arrivée du catalogue : « Champion 157 » sans icône figé dans la timeline et les replays enregistrés. | Synchronisation différée jusqu'au catalogue (ou son échec) ; catalogue servi depuis le cache local immédiatement, puis revalidé en arrière-plan, conservé hors ligne. |
| Un clic sans effet sur un emplacement (vider un slot vide, fermer la recherche) basculait en mode manuel et quittait la synchronisation. | Le passage en manuel n'a lieu que si le slot change. |
| Quitter un replay par le sélecteur de mode conservait les étapes futures dans la timeline de la nouvelle session. | Sortie de replay = variante tronquée à l'étape visible. |
| Ajouter un champion suggéré effaçait toutes les suggestions du conseiller de pool. | Les suggestions restent affichées ; celles déjà ajoutées sont signalées. |
| Le store League publiait un nouvel état toutes les 500 ms même sans changement et réinterrogeait l'identité invocateur à chaque cycle. | Publication uniquement sur changement ; identité réessayée toutes les dix secondes. |
| Connecteur Rust : côté d'équipe lu sur un champ inexistant (`teamId`), index d'action incrémenté par `ten_bans_reveal`. | Lecture de `team` (1/2) avec repli, seuls bans et picks comptent ; test mis à jour. |
| Script d'auto-update : le retour arrière laissait le dépôt en HEAD détaché, bloquant toutes les mises à jour suivantes. | `git reset --keep` sur la branche. |
| Code mort : actions LCU du store sans appelant, intervalle ± jamais renseigné, `data/draft.js` inutilisé, contrôles de rôle redondants, doubles `raise_for_status`. | Supprimés. Erreurs API formatées par un seul helper client. |

Vérifications : 58 tests unitaires serveur (15 nouveaux), 3 tests d'intégration sur PostgreSQL 16 temporaire, 20 tests Vitest (6 nouveaux), test du parser LCU Rust, build Vite, 3 parcours Playwright (navigateur système via `PLAYWRIGHT_CHANNEL=chrome`, ou `npx playwright install chromium`).

## Passage au scoring en points de win rate (10 septembre 2026)

Le score composite 0-100 est remplacé par une somme de contributions exprimées en points de win rate : méta, matchup, adversaire à venir, maîtrise, composition, archétype, synergie, mécaniques et modèle. Chacune porte un écart-type, et le chiffre affiché est l'avantage signé par rapport à la moyenne du pool évalué, par exemple `+3,1 ±1,4`. Quand l'écart entre deux champions reste sous l'incertitude combinée, l'interface les annonce équivalents au lieu de forcer un classement.

Le rang du joueur entre dans le moteur : lu sur le client League, sinon choisi dans le profil. Il sélectionne les statistiques Lolalytics de son niveau, pondère le poids du confort et fixe la part de counter-pick attendue de l'adversaire. La maîtrise s'appuie désormais sur les parties classées réelles et les points de maîtrise Riot quand ils sont disponibles, le palier déclaré servant de repli.

Sont supprimés : les poids normalisés et leurs multiplicateurs par rôle, le remodelage par ordre de pick, le pool de bonus plafonné, le plancher et les bornes 5-97, la normalisation post-classement, la table de maîtrise par palier, la liste de champions dangereux en blind et le score de risque de draft. Le terme « adversaire à venir » les remplace en calculant l'espérance du matchup sur les picks adverses encore possibles. Les préférences de l'utilisateur deviennent des multiplicateurs de ×0,5 à ×1,5 (migration 004, qui ajoute aussi le rang au profil et l'unité de score à l'historique).

Vérifications : 105 tests unitaires serveur, 3 tests d'intégration sur PostgreSQL 16 temporaire, 24 tests Vitest, build Vite, 3 parcours Playwright, 2 tests Rust. La suite de calibration tourne sur données Lolalytics réelles : 33/50 assertions sur les cas historiques contre 35/50 pour l'ancien moteur, avec la catégorie synergie qui passe de 0/2 à 2/2. Les cas restants et deux pistes de conception non appliquées sont décrits dans [le bilan de calibration](server/tests/calibration/README.md).

Conception détaillée : [la spec du scoring](docs/superpowers/specs/2026-09-10-scoring-wr-points-design.md) et [le plan d'implémentation](docs/superpowers/plans/2026-09-10-scoring-wr-points.md).

## Qualité du moteur de scoring (17 septembre 2026)

Trois vagues sur le moteur de scoring, plus la condition qui les rendait mesurables.

**Le cache de calibration est gelé.** Le cache vivant a un TTL de six heures : entre le 14 et le 15 septembre, les compteurs de triage ont bougé de 20/10/8/14 à 21/9/8/14 sans un changement de code. `run_calibration.py --freeze-cache` copie le cache dans `server/app/data/cache-frozen/` avec un manifeste daté ; la calibration l'utilise ensuite par défaut, réseau interdit, `--live-cache` pour en sortir. Une entrée absente lève `FrozenCacheMiss`, qui hérite de `BaseException` parce que les fetchers avalent tout `Exception` et renverraient `{}`.

**Vague 1 — le biais de la distribution adverse.** Le bras counter répartissait sa masse au prorata de la seule menace : un counter très dur mais rare pesait autant qu'un counter moyen massivement joué. La masse devient `pick_rate × menace`. `counter_alpha` concentre cette masse sur les pires matchups, hors du rang.

**Vague 2 — le risque subi départage le groupe de tête.** Un écart-type mélangeait ce que le joueur ne peut pas savoir (quel adversaire sera pické) et ce que le moteur ne sait pas estimer. `Term.outcome_sd` isole la part subie ; à égalité statistique, le candidat le plus sûr passe devant. Le groupe reste déterminé par l'espérance, l'ordre à l'intérieur par le risque.

**Chiffres de vérification** : 154 tests unitaires serveur, 24 tests Vitest, build Vite. Calibration sur cache gelé, `master_plus` : 33/52 au baseline, **34/52 (65,4 %)** après les deux vagues, le gain étant dans `blind_pick` (5/10 → 6/10), aucune catégorie en régression.

**Résultat de référence** : Yasuo passe de n°1 à n°3 du blind pick mid. Il garde la meilleure espérance mais porte le plus gros risque subi. Cela rejoint l'arbitrage du joueur du 14/09 — « Yasuo c'est du bait, pas un bon pick à blind ».

**Ce qui reste ouvert** :

- **La vague 1 n'est pas mesurable par la suite.** Ni le pick rate ni α ne déplacent une seule assertion, alors que 28 des 38 comparaisons du diagnostic bougent. Avec 19 assertions réellement discriminantes sur 52, la suite n'a pas le pouvoir de résolution nécessaire pour départager un paramètre continu. `counter_alpha` vaut 1,0 faute de preuve, pas au vu d'une preuve. Voir le chantier 12.
- La décision sur les buckets `_plus` de gold à diamond (spec §3) n'est pas prise.
- **Le jugement du joueur n'a porté que sur le rôle ADC/bot.** Les 102 champions de top, jungle et mid ne sont toujours pas notés à la main, et la grille de notation n'est écrite pour aucune dimension sauf `cc`.

Conception détaillée : [la spec](docs/superpowers/specs/2026-09-14-qualite-moteur-scoring-design.md), [le plan](docs/superpowers/plans/2026-09-14-qualite-moteur-scoring.md), [le bilan de calibration](server/tests/calibration/README.md) et [les chantiers ouverts](docs/CHANTIERS.md).
