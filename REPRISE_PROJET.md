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
