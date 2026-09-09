# WPA, données et raisonnement de draft

## Ce que DALIA calcule

Le [site Coachless](https://coachless.gg/) présente le WPA pour évaluer la valeur d'une décision, notamment les choix de builds. C'est une piste différente d'un simple win rate observé. Son interface publique ne constitue pas un contrat d'API : aucune API documentée ni donnée autorisée Coachless n'a été connectée pendant cette reprise.

DALIA implémente séparément un **WPA estimé par son modèle**, disponible seulement lorsqu'un modèle valide peut évaluer tous les choix concernés :

`WPA(c | draft) = 100 × [P(victoire | c, draft) − moyenne des P(victoire | alternatives évaluées, draft)]`

Les alternatives, le rôle, le côté et la draft sont identiques pour le calcul d'une comparaison. Avec A à 56 % et B à 52 %, leur référence commune est 54 % : WPA(A) = +2 points, WPA(B) = −2 points et A − B = +4 points. Ajouter une troisième alternative change la référence moyenne ; les WPA de deux listes différentes ne se comparent pas directement. Ce n'est ni `win rate − 50`, ni une preuve de causalité, ni une statistique provenant de Coachless.

L'API fournit la source `DALIA`, le type `model_estimate`, les IDs des alternatives, la référence et le manifeste du modèle. L'effet dans le score est limité à `2 × WPA`, borné à ±8 points. Le sous-score ML n'est pas ajouté une deuxième fois au score composite. Sans estimation admissible, le champ est `null` et l'interface affiche « WPA indisponible ».

Pour une future source Coachless autorisée : demander un contrat de données précisant définition, référence, contexte de décision, rôle, rang, queue, patch, échantillon et date. Les WPA de builds ne sont pas directement transposables aux picks de champions. Ne pas agréger deux mesures dont les références diffèrent.

## Conditions du modèle

Les matchs sont dédupliqués et séparés avant masquage : 70 % entraînement, 10 % validation, 10 % calibration, 10 % test temporel. La température est choisie sur la calibration. Le test publie log loss, Brier, ECE et accuracy, ainsi que les résultats pour 4, 6, 8 et 10 champions connus. Le masquage couvre les drafts partielles ; le padding reste nul.

L'activation exige au moins 200 matchs uniques de test, des dates permettant un découpage temporel, de meilleurs Brier/log loss que le prior de côté appris sur le train, ECE ≤ 0,08 et de meilleurs scores que cette baseline à 6, 8 et 10 champions connus. Le watcher exige 2 000 matchs uniques du patch et un corpus différent de la dernière tentative. Ces seuils sont des garde-fous initiaux à réévaluer, pas une certification de qualité.

L'inférence exige au moins 6 champions connus, 80 apparitions d'entraînement pour chacun et une attribution de rôle suffisamment nette. Un changement de patch désactive les modèles non compatibles. Les checkpoints historiques sans manifeste accepté sont refusés. Un candidat refusé ne remplace pas le modèle actif ; le précédent est sauvegardé avant remplacement atomique.

Il reste à entraîner sur de vraies données récentes, mesurer les performances par rôle/rang et vérifier la calibration en situation réelle. Aucun modèle nouvellement entraîné sur un corpus réel n'est livré ici. Le replay permet de recueillir les situations pour ces évaluations, sans attribuer automatiquement une victoire au conseil.

## Raisonnement sur les compétences

Les règles de [mechanics.py](../server/app/services/mechanics.py) produisent chacune une interaction, ses cibles, son effet stratégique, une limite et une source de kit. Le total de ces règles est borné à ±12 points ; ces points sont des choix heuristiques à calibrer, pas des points de probabilité.

Exemples couverts :

- **Poppy contre des dashs interruptibles** : le W peut protéger une zone face à Jarvan IV, Vi ou d'autres entrées couvertes. Les téléportations d'Ezreal et l'engage imparable de Malphite ne reçoivent pas ce bonus. Le placement et la disponibilité du W limitent sa valeur. [Kit Poppy](https://www.leagueoflegends.com/en-gb/champions/poppy/).
- **Nasus contre des carries immobiles dépendants des attaques** : Wither réduit déplacement et vitesse d'attaque, mais Nasus doit atteindre sa cible. Le peel adverse réduit le bonus : être sans dash ne rend pas automatiquement un champion facile à punir. [Notes officielles 12.19, changement de Wither](https://www.leagueoflegends.com/en-au/news/game-updates/patch-12-19-notes/).
- **Jax et Nilah contre les attaques de base** : fenêtre défensive identifiée et limite contre les sorts ; l'esquive de Nilah vient de son W, pas de son passif. [Kit Nilah](https://www.leagueoflegends.com/en-us/champions/nilah/).
- **Cassiopeia** pour entraver certaines mobilités, **Morgana** contre des contrôles évitables par son bouclier, **Yasuo** avec des projections alliées, certains kits à dégâts proportionnels aux PV contre des tanks.

Les anciennes explications inventant de l'anti-soin pour des champions sans cet effet ont été retirées du parcours courant. Les règles restent une sélection manuelle : elles ne couvrent pas tous les sorts, items, niveaux, cooldowns, positions ou interactions particulières. Les patchs demandent une relecture des règles et de leurs tests.

## Statistiques et modes dégradés

La méta choisit une seule fenêtre par champion : patch courant si l'échantillon atteint le minimum configuré, sinon 30 jours si disponibles. Ces fenêtres ne sont pas moyennées car elles se recouvrent. Le résultat contient nombre de matchs et fenêtre ; l'état de données expose patch, rang, queue, région et date de collecte connue.

Les matchups d'un adversaire affecté à un autre rôle utilisent la population de ce rôle ; ils ne reprennent pas implicitement son win rate de lane. Les valeurs externes malformées ou non finies sont ignorées. Sans échantillon, aucune probabilité observée n'est affichée : le moteur utilise une estimation de kit signalée comme telle. Les deltas de synergie issus des kits restent explicitement heuristiques.

TTL des caches, actualisation de patch, concurrence bornée, délai maximum de recommandation et rafraîchissement personnel en arrière-plan limitent le blocage par les sources externes. Le site Lolalytics et Data Dragon restent des dépendances réseau : leur indisponibilité et leur fraîcheur ne doivent pas être confondues avec la qualité d'un modèle.
